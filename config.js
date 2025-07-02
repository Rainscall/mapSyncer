import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    l4d2ListEndpoint: 'https://backend.union.l4d2list.api.colorspark.net',
    s3Endpoint: 'https://5sim.tos-s3-cn-hongkong.bytepluses.com',
    files: {
        metadataFilePath: path.join(__dirname, 'metadata', 'metadata.json'),
        mapPath: path.join(__dirname, '../left4dead2/addons/workshop'),
        // mapPath: path.join(__dirname, 'left4dead2/addons/workshop'),
    }
}

export default config