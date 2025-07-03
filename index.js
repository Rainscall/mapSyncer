import { sync } from "./sync.js";
import { addRequiredMaps, confirm, getMetadata, initMapStorage, initMetadataFile, removeRequiredMaps, select } from "./utils.js";
import { execSync } from "child_process";
import nodeDiskInfo from "node-disk-info";

execSync('reset');
const diskInfo = nodeDiskInfo.getDiskInfoSync().reduce((max, current) => {
    return current._blocks > max._blocks ? current : max;
})

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
    '退出',
], '选择要执行的操作')) {
    case '同步地图': {
        await sync();
        break;
    }
    case '列出地图': {
        console.log((await getMetadata()).required_map_keys)
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
    case '退出程序': {
        process.exit()
    }
}