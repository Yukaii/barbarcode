import zlib from 'zlib';

export function compressData(data) {
  console.log('Compressing data, original length:', data.length);
  const buffer = Buffer.from(data, 'utf-8');
  const compressed = zlib.deflateSync(buffer, { level: 9 }); // Maximum compression
  console.log('Compressed data length:', compressed.length);
  return compressed;
}

export function decompressData(data) {
  console.log('Decompressing data, compressed length:', data.length);
  const decompressed = zlib.inflateSync(data).toString('utf-8');
  console.log('Decompressed data length:', decompressed.length);
  return decompressed;
}