// server/ui.tsx
import React from 'react';
import { Box, Text, Newline } from 'ink';

interface UIProps {
  qrCodeString: string;
  currentQrPart: number;
  totalQrParts: number;
  logs: string[];
}

export const App: React.FC<UIProps> = ({ qrCodeString, currentQrPart, totalQrParts, logs }) => (
  <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" height={process.stdout.rows}>
    <Box flexDirection="column" flexGrow={1} flexBasis="70%" minHeight="70%">
      <Box borderStyle="single" borderColor="green" padding={1} marginBottom={1} flexGrow={1} flexDirection="column">
        <Text bold>
          QR Code Display {currentQrPart > 0 ? `(Part ${currentQrPart}/${totalQrParts})` : ''}
        </Text>
        <Newline />
        {qrCodeString.split('\n').map((line, idx) => (
          <Text key={idx}>{line === "" ? " " : line}</Text>
        ))}
      </Box>
    </Box>
    <Box flexDirection="column" flexBasis="30%" height={Math.floor(process.stdout.rows * 0.3)} borderStyle="single" borderColor="blue" padding={1}>
      <Text bold>Server Logs</Text>
      <Newline />
      {logs.map((log, index) => (
        <Text key={index}>{log}</Text>
      ))}
    </Box>
  </Box>
);
