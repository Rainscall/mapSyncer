// processVpk.js (修正版)

import * as fs from 'fs';
import * as fsp from 'fs/promises';

// readNullTerminatedString 函数保持不变...
/**
 * 从 Buffer 中指定偏移量开始读取一个以 null 结尾的字符串 (C-style string)。
 * @param {Buffer} buffer - 从中读取的 Buffer。
 * @param {number} offset - 开始读取的偏移量。
 * @returns {{str: string, length: number}} 返回包含读取到的字符串和其字节长度（包含末尾的 null）的对象。
 */
function readNullTerminatedString(buffer, offset) {
    const nullByteIndex = buffer.indexOf(0, offset);
    if (nullByteIndex === -1) {
        throw new Error('Could not find null terminator in string.');
    }
    const str = buffer.toString('utf8', offset, nullByteIndex);
    return {
        str,
        length: str.length + 1,
    };
}


/**
 * 处理 VPK v1 文件，移除指定后缀的文件后重新打包成一个新的 VPK 文件。
 * 该函数使用流式处理文件内容，以优化内存使用。
 * @param {string} inputFilePath - 待处理的 VPK 文件路径。
 * @param {string} outputFilePath - 新生成的 VPK 文件的输出路径。
 * @returns {Promise<void>} 当处理完成时 resolve 的 Promise。
 */
export async function processVpk(inputFilePath, outputFilePath) {
    console.log(`Starting VPK processing for: ${inputFilePath}`);

    const excludedExtensions = new Set(['wav', 'mp3', 'vtf']);
    let inputFile;

    try {
        // 步骤 1, 2, 3, 4 保持不变...
        inputFile = await fsp.open(inputFilePath, 'r');
        const headerBuffer = Buffer.alloc(12);
        await inputFile.read(headerBuffer, 0, 12, 0);
        const signature = headerBuffer.readUInt32LE(0);
        const version = headerBuffer.readUInt32LE(4);
        const treeSize = headerBuffer.readUInt32LE(8);
        if (signature !== 0x55aa1234 || version !== 1) {
            throw new Error('Invalid or unsupported VPK file format. Only VPK v1 is supported.');
        }
        console.log(`VPK Version 1 header validated. Tree size: ${treeSize} bytes.`);
        const originalTreeOffset = 12;
        const originalDataOffset = originalTreeOffset + treeSize;
        const treeBuffer = Buffer.alloc(treeSize);
        await inputFile.read(treeBuffer, 0, treeSize, originalTreeOffset);
        const filteredEntries = [];
        let treeParseOffset = 0;
        console.log('Parsing directory tree and filtering files...');
        while (treeParseOffset < treeSize) {
            const { str: ext, length: extLen } = readNullTerminatedString(treeBuffer, treeParseOffset);
            treeParseOffset += extLen;
            if (ext.length === 0) break;
            while (treeParseOffset < treeSize) {
                const { str: path, length: pathLen } = readNullTerminatedString(treeBuffer, treeParseOffset);
                treeParseOffset += pathLen;
                if (path.length === 0) break;
                while (treeParseOffset < treeSize) {
                    const { str: filename, length: fileLen } = readNullTerminatedString(treeBuffer, treeParseOffset);
                    treeParseOffset += fileLen;
                    if (filename.length === 0) break;
                    const entryDataBuffer = treeBuffer.subarray(treeParseOffset, treeParseOffset + 18);
                    treeParseOffset += 18;
                    if (!excludedExtensions.has(ext.toLowerCase())) {
                        filteredEntries.push({
                            ext, path, filename,
                            crc: entryDataBuffer.readUInt32LE(0),
                            preloadBytes: entryDataBuffer.readUInt16LE(4),
                            entryOffset: entryDataBuffer.readUInt32LE(8),
                            entryLength: entryDataBuffer.readUInt32LE(12),
                        });
                    }
                }
            }
        }
        console.log(`Found ${filteredEntries.length} files to keep.`);
        console.log('Building new directory tree...');
        let newCurrentDataOffset = 0;
        const newEntriesForTree = filteredEntries.map(entry => {
            const newEntry = { ...entry, newOffset: newCurrentDataOffset };
            newCurrentDataOffset += entry.entryLength;
            return newEntry;
        });
        const treeStructure = {};
        for (const entry of newEntriesForTree) {
            if (!treeStructure[entry.ext]) treeStructure[entry.ext] = {};
            if (!treeStructure[entry.ext][entry.path]) treeStructure[entry.ext][entry.path] = [];
            treeStructure[entry.ext][entry.path].push(entry);
        }
        const newTreeParts = [];
        for (const ext in treeStructure) {
            newTreeParts.push(Buffer.from(ext + '\0', 'utf8'));
            for (const path in treeStructure[ext]) {
                newTreeParts.push(Buffer.from(path + '\0', 'utf8'));
                for (const entry of treeStructure[ext][path]) {
                    newTreeParts.push(Buffer.from(entry.filename + '\0', 'utf8'));
                    const entryData = Buffer.alloc(18);
                    let offset = 0;
                    offset = entryData.writeUInt32LE(entry.crc, offset);
                    offset = entryData.writeUInt16LE(entry.preloadBytes, offset);
                    offset = entryData.writeUInt16LE(0x7fff, offset);
                    offset = entryData.writeUInt32LE(entry.newOffset, offset);
                    offset = entryData.writeUInt32LE(entry.entryLength, offset);
                    entryData.writeUInt16LE(0xFFFF, offset);
                    newTreeParts.push(entryData);
                }
                newTreeParts.push(Buffer.from('\0', 'utf8'));
            }
            newTreeParts.push(Buffer.from('\0', 'utf8'));
        }
        newTreeParts.push(Buffer.from('\0', 'utf8'));
        const newTreeBuffer = Buffer.concat(newTreeParts);
        const newTreeSize = newTreeBuffer.length;

        // 5. 流式写入新的 VPK 文件
        console.log(`Writing new VPK file to: ${outputFilePath}`);
        const outputFileStream = fs.createWriteStream(outputFilePath);

        // ======================= 代码修改部分开始 =======================

        // 为输出流的整个生命周期创建一个 Promise。
        // 它将在写入完成时 resolve，或在发生任何写入错误时 reject。
        const writeStreamLifecycle = new Promise((resolve, reject) => {
            outputFileStream.on('finish', resolve);
            outputFileStream.on('error', reject);
        });

        // 5a. 写入新文件头
        const newHeaderBuffer = Buffer.alloc(12);
        newHeaderBuffer.writeUInt32LE(0x55aa1234, 0);
        newHeaderBuffer.writeUInt32LE(1, 4);
        newHeaderBuffer.writeUInt32LE(newTreeSize, 8);
        outputFileStream.write(newHeaderBuffer);

        // 5b. 写入新目录树
        outputFileStream.write(newTreeBuffer);

        // 5c. 逐个流式写入文件数据
        console.log('Streaming file data...');
        for (const entry of newEntriesForTree) {
            const readStream = fs.createReadStream(inputFilePath, {
                start: originalDataOffset + entry.entryOffset,
                end: originalDataOffset + entry.entryOffset + entry.entryLength - 1,
            });

            // 这个 Promise 现在只关心读取流本身是否出错
            const pipePromise = new Promise((resolve, reject) => {
                readStream.on('end', resolve);
                readStream.on('error', reject);
                // 不再监听 outputFileStream 的错误，因为它已由 writeStreamLifecycle 统一处理
                readStream.pipe(outputFileStream, { end: false });
            });
            await pipePromise;
        }

        // 所有内容都已通过管道传输，现在可以结束写入流了
        outputFileStream.end();

        // 等待写入流完成所有缓冲数据的写入并关闭文件
        // 如果在整个过程中发生任何写入错误，此 await 将会抛出异常
        await writeStreamLifecycle;

        // ======================= 代码修改部分结束 =======================

        console.log('VPK processing completed successfully.');

    } catch (error) {
        console.error('An error occurred during VPK processing:', error);
        if (fs.existsSync(outputFilePath)) {
            await fsp.unlink(outputFilePath).catch(err => console.error('Failed to clean up output file:', err));
        }
        throw error;
    } finally {
        if (inputFile) {
            await inputFile.close();
        }
    }
}
