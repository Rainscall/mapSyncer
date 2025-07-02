import { sync } from "./sync.js";
import { addRequiredMaps, confirm, getMetadata, initMapStorage, initMetadataFile, removeRequiredMaps, select } from "./utils.js";

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