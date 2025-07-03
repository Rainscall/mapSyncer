import { sync } from "./sync.js";
import { addRequiredMaps, confirm, getMetadata, initMapStorage, initMetadataFile, printGrid, removeRequiredMaps, select, uploadText } from "./utils.js";
import { execSync } from "child_process";
import nodeDiskInfo from "node-disk-info";
import ansiColors from "ansi-colors";

execSync('reset');
const diskInfo = nodeDiskInfo.getDiskInfoSync().reduce((max, current) => {
    return current._blocks > max._blocks ? current : max;
})

console.log([
    "                      ____",
    " _ __ ___   __ _ _ __/ ___| _   _ _ __   ___ ___ _ __ ",
    "| '_ ` _ \\ / _` | '_ \\___ \\| | | | '_ \\ / __/ _ \\ '__|",
    "| | | | | | (_| | |_) |__) | |_| | | | | (_|  __/ |   ",
    "|_| |_| |_|\\__,_| .__/____/ \\__, |_| |_|\\___\\___|_|   ",
    "                 |_|         |___/",
    "",
].join('\n'))

console.table([
    {
        总空间: `${(diskInfo._blocks / 1024 / 1024).toFixed(2)} GiB`,
        已使用: `${(diskInfo._used / 1024 / 1024).toFixed(2)} GiB`,
        可用: `${(diskInfo._available / 1024 / 1024).toFixed(2)} GiB`,
        占比: diskInfo._capacity
    }
])

await initMapStorage()
await initMetadataFile()

switch (await select([
    '同步地图',
    '列出地图',
    '增加地图',
    '删除地图',
    '导出地图列表',
    '退出',
], '选择要执行的操作')) {
    case '同步地图': {
        await sync();
        break;
    }
    case '列出地图': {
        const metadata = await getMetadata();
        let maps = [];
        metadata.required_map_keys.forEach(e => {
            maps.push(`${metadata.downloaded_maps.find(item => item.key === e) ?
                ansiColors.green('√') : ansiColors.red('×')} ` +
                `${e.replace('maps/【Map】', '').replace('.zip', '')}`
            )
        });

        printGrid(maps)
        console.log(`${ansiColors.green('√')}:已下载 ${ansiColors.red('×')}:未下载`)
        break;
    }
    case '增加地图': {
        await addRequiredMaps()
        if (await confirm('要现在就进行同步吗？')) {
            await sync();
        }
        break;
    }
    case '删除地图': {
        await removeRequiredMaps()
        break;
    }
    case '导出地图列表': {
        console.log('加载中...')
        console.log('公共访问链接：', await uploadText(
            (await getMetadata())
                .required_map_keys
                .map(e => e.replace('maps/【Map】', '')
                    .replace('.zip', ''))
                .join('\n')
        ))
        break;
    }
    case '退出程序': {
        process.exit()
    }
}