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
  <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
    <Box flexDirection="row">
      <Box width="50%" borderStyle="single" borderColor="green" padding={1} marginRight={1}>
        <Text bold>
          QR Code Display {currentQrPart > 0 ? `(Part ${currentQrPart}/${totalQrParts})` : ''}
        </Text>
        <Newline />
        <Text>{qrCodeString}</Text>
      </Box>
      <Box width="50%" borderStyle="single" borderColor="blue" padding={1}>
        <Text bold>Server Logs</Text>
        <Newline />
        {logs.map((log, index) => (
          <Text key={index}>{log}</Text>
        ))}
      </Box>
    </Box>
  </Box>
);
