// server/ui.tsx
import React, { useRef, useEffect, useState } from 'react';
import { Box, Text, Newline, measureElement, useInput } from 'ink';

interface UIProps {
  qrCodeString: string;
  currentQrPart: number;
  totalQrParts: number;
  logs: string[];
}

export const App: React.FC<UIProps> = ({ qrCodeString, currentQrPart, totalQrParts, logs }) => {
  const qrBoxRef = useRef(null);
  const [qrBoxHeight, setQrBoxHeight] = useState(0);
  const [showLogs, setShowLogs] = useState(true);

  useInput((input, key) => {
    if (input.toLowerCase() === 'l') {
      setShowLogs((prev) => !prev);
    }
  });

  useEffect(() => {
    if (qrBoxRef.current) {
      const { height } = measureElement(qrBoxRef.current);
      setQrBoxHeight(height);
    }
  }, [qrCodeString, showLogs]);

  const qrLines = qrCodeString.split('\n');
  const isTruncated = qrBoxHeight > 0 && qrLines.length > qrBoxHeight;

  // Calculate QR code box height based on log panel visibility
  const qrBoxFlexBasis = showLogs ? "70%" : "100%";
  const qrBoxMinHeight = showLogs ? "70%" : "100%";

  return (
    <Box flexDirection="column" padding={1} height={process.stdout.rows}>
      <Box flexDirection="column" flexGrow={1} flexBasis={qrBoxFlexBasis} minHeight={qrBoxMinHeight}>
        <Box
          borderStyle="classic"
          borderColor="green"
          padding={0}
          marginBottom={0}
          flexGrow={1}
          flexDirection="column"
          ref={qrBoxRef}
        >
          <Text bold>
            QR Code Display {currentQrPart > 0 ? `(Part ${currentQrPart}/${totalQrParts})` : ''}
          </Text>
          <Text dimColor>
            Press "l" to toggle log panel
          </Text>
          {isTruncated && (
            <>
              <Newline />
              <Text color="red" bold>
                Warning: Terminal not tall enough! Increase terminal height to display the full QR code for scanning.
              </Text>
            </>
          )}
          <Newline />
          {qrLines.map((line, idx) => (
            <Text key={idx}>{line === "" ? " " : line}</Text>
          ))}
        </Box>
      </Box>
      {showLogs && (
        <Box flexDirection="column" flexBasis="30%" height={Math.floor(process.stdout.rows * 0.2)} borderStyle="single" borderColor="blue" padding={1}>
          <Text bold>Server Logs</Text>
          <Newline />
          {logs.map((log, index) => (
            <Text key={index}>{log}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
