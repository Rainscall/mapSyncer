import config from "./config.js";
import fs from 'fs';
import { getMapList, getMetadata, getZipFileNamesFromUrl, putMetadata } from "./utils.js";
import path from "path";
import fetch from "node-fetch";
import unzipper from "unzipper";
import il from 'iconv-lite';

export async function sync() {
    let metadata = await getMetadata();
    const mapList = await getMapList();

    let mapsToDownload = metadata.required_map_keys;
    let downloadedMaps = metadata.downloaded_maps;

    console.log('正在验证：', mapsToDownload)

    mapsToDownload =
        mapsToDownload
            .filter(e => mapList.map(e => e.Key).includes(e) &&
                mapList.find(item => item.Key === e)
                    .LastModified !== downloadedMaps
                        .find(item => item.key === e)?.lastModified);

    if (!mapsToDownload.length) {
        console.log('无需进行同步')
        return;
    }

    console.log('需要下载的地图：', mapsToDownload)

    for (let i = 0; i < mapsToDownload.length; i++) {
        const key = mapsToDownload[i];

        if (downloadedMaps.find(e => e.key === key)) {
            downloadedMaps.find(e => e.key === key).extractedFiles.forEach(e => {
                fs.promises.rm(path.join(config.files.mapPath, e)).catch(e => {
                    console.warn(`未能删除：${key}`, e)
                })
            });
        }

        mapsToDownload[i] = {
            key,
            lastModified: mapList.find(e => e.Key === key).LastModified,
            extractedFiles: await getZipFileNamesFromUrl(`${config.s3Endpoint}/${key}`),
        }
    }

    console.log('已获取元数据：', mapsToDownload)

    for (let i = 0; i < mapsToDownload.length; i++) {
        const map = mapsToDownload[i];
        console.log(`正在下载：${map.key}`);
        const zipFilePath = `${path.join(config.files.mapPath, path.basename(map.key))}`;

        let r = await fetch(`${config.s3Endpoint}/${map.key}`);

        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(zipFilePath)
            r.body.pipe(writeStream)
            r.body.on('error', reject)
            writeStream.on('finish', resolve)
        })

        console.log(`下载完成，正在解压`);

        await new Promise((resolve, reject) => {
            fs.createReadStream(zipFilePath)
                .pipe(unzipper.Parse())
                .on('entry', entry => {
                    const isUnicode = entry.props.flags.isUnicode;
                    const fileName = isUnicode ? entry.path : il.decode(entry.props.pathBuffer, 'gbk');
                    entry.pipe(fs.createWriteStream(path.join(config.files.mapPath, fileName)));
                })
                .on('error', reject)
                .on('finish', resolve)
        })

        fs.promises.rm(zipFilePath);

        metadata.downloaded_maps = metadata.downloaded_maps.filter(e => e.key !== map.key)
        metadata.downloaded_maps.push(map)

        console.log(`解压完成`);
    }

    console.log(`同步完成`);
    await putMetadata(metadata)
}