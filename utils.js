import config from "./config.js";
import fs from 'fs/promises';
import fsc from 'fs';
import path from "path";

export async function initMapStorage() {
    await fs.mkdir(config.files.mapPath, {
        recursive: true
    })
}

export async function initMetadataFile() {
    if (fsc.existsSync(config.files.metadataFilePath)) {
        return;
    }

    const metadata = {
        required_map_keys: [],
        downloaded_maps: []
    }

    await fs.mkdir(path.dirname(config.files.metadataFilePath), {
        recursive: true
    })

    await fs.writeFile(config.files.metadataFilePath, JSON.stringify(metadata, null, 2), {
        encoding: 'utf-8',
        flag: 'w'
    })
}

export async function getMetadata() {
    return JSON.parse(await fs.readFile(config.files.metadataFilePath, { encoding: 'utf-8' }))
}

export async function putMetadata(metadata) {
    if (typeof metadata !== 'object') {
        throw new Error("metadata should be an object");
    }

    await fs.mkdir(path.dirname(config.files.metadataFilePath), {
        recursive: true
    })

    return fs.writeFile(config.files.metadataFilePath, JSON.stringify(metadata, null, 2), {
        encoding: 'utf-8',
        flag: 'w'
    })
}

export async function getMapList() {
    let r = await fetch('https://backend.union.l4d2list.api.colorspark.net/storage/list/maps').then(r => r.json());
    if (r.status !== 'SUCCESS') {
        throw new Error(`Failed to fetch map list: ${r.status}`);
    }
    return r.message;
}

/**
       * 通过远程读取ZIP文件的末尾部分来获取其内部的文件名列表。
       * @param {string} url 指向ZIP文件的URL。
       * @returns {Promise<string[]>} 一个包含所有根目录文件名的数组。
       */
export async function getZipFileNamesFromUrl(url) {
    // --- 步骤 1: 使用 HEAD 请求获取文件总大小 ---
    const headResponse = await fetch(url, { method: 'HEAD' });
    if (!headResponse.ok) {
        throw new Error(`无法获取文件头信息: ${headResponse.statusText}`);
    }
    const totalSize = Number(headResponse.headers.get('Content-Length'));
    if (isNaN(totalSize) || totalSize === 0) {
        throw new Error('无法确定文件大小或文件为空。');
    }

    // --- 步骤 2: 读取文件末尾的 64KB 数据 ---
    // EOCD (End of Central Directory) 记录位于文件末尾. 64KB 足够容纳它和可能的注释。
    const EOCD_CHUNK_SIZE = 65536;
    const eocdStart = Math.max(0, totalSize - EOCD_CHUNK_SIZE);

    const tailResponse = await fetch(url, {
        headers: { 'Range': `bytes=${eocdStart}-${totalSize - 1}` }
    });
    if (!tailResponse.ok) {
        throw new Error(`无法读取文件末尾部分: ${tailResponse.statusText}`);
    }
    const tailBuffer = await tailResponse.arrayBuffer();
    const tailView = new DataView(tailBuffer);

    // --- 步骤 3: 在末尾数据中定位 EOCD (End of Central Directory) 记录 ---
    // EOCD 特征签名: 0x06054b50 (PK\x05\x06)
    const EOCD_SIGNATURE = 0x06054b50;
    let eocdOffset = -1;
    // 从后向前搜索，因为EOCD在末尾，但末尾可能有zip注释
    for (let i = tailView.byteLength - 22; i >= 0; i--) {
        if (tailView.getUint32(i, true) === EOCD_SIGNATURE) {
            eocdOffset = i;
            break;
        }
    }

    if (eocdOffset === -1) {
        throw new Error('不是一个有效的ZIP文件或找不到EOCD记录。');
    }

    // 从EOCD中解析中央目录(Central Directory)的大小和偏移量
    // EOCD结构:
    // - 偏移量 12 (4 bytes): 中央目录大小
    // - 偏移量 16 (4 bytes): 中央目录起始位置的偏移量
    const cdSize = tailView.getUint32(eocdOffset + 12, true);
    const cdOffset = tailView.getUint32(eocdOffset + 16, true);

    // --- 步骤 4: 根据偏移量和大小，发起第二次请求，精确获取整个中央目录 ---
    const cdResponse = await fetch(url, {
        headers: { 'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}` }
    });
    if (!cdResponse.ok) {
        throw new Error(`无法读取中央目录: ${cdResponse.statusText}`);
    }
    const cdBuffer = await cdResponse.arrayBuffer();
    const cdView = new DataView(cdBuffer);

    // --- 步骤 5: 解析中央目录，提取文件名 ---
    const filenames = [];
    let currentOffset = 0;
    const CD_HEADER_SIGNATURE = 0x02014b50; // (PK\x01\x02)
    const decoder = new TextDecoder('GBK');

    while (currentOffset < cdView.byteLength) {
        // 检查中央文件头的特征签名
        if (cdView.getUint32(currentOffset, true) !== CD_HEADER_SIGNATURE) {
            break; // 如果签名不匹配，说明目录已结束
        }

        // 中央文件头结构:
        // - 偏移量 28 (2 bytes): 文件名长度 (n)
        // - 偏移量 30 (2 bytes): 扩展字段长度 (m)
        // - 偏移量 32 (2 bytes): 文件注释长度 (k)
        const filenameLength = cdView.getUint16(currentOffset + 28, true);
        const extraFieldLength = cdView.getUint16(currentOffset + 30, true);
        const fileCommentLength = cdView.getUint16(currentOffset + 32, true);

        // 提取文件名
        const filenameBytes = new Uint8Array(cdBuffer, currentOffset + 46, filenameLength);
        const filename = decoder.decode(filenameBytes);

        // 根据要求，我们只关心根目录下的文件
        // 如果文件名以'/'结尾，它是一个目录，可以忽略
        if (!filename.endsWith('/')) {
            filenames.push(filename);
        }

        // 移动到下一个中央文件头记录
        currentOffset += 46 + filenameLength + extraFieldLength + fileCommentLength;
    }

    return filenames;
}