import robotjs from 'robotjs';

const { keyTap, setKeyboardDelay, typeString } = robotjs;

export function executeKeystrokes(pattern) {
  console.log('Executing keystroke pattern:', pattern);
  const keystrokes = pattern.match(/(\{[^}]+\}|[^{]+)/g);

  for (const keystroke of keystrokes) {
    if (keystroke.startsWith('{') && keystroke.endsWith('}')) {
      const command = keystroke.slice(1, -1);
      console.log('Executing command:', command);
      if (command === 'enter') {
        keyTap('enter');
      } else if (command === 'tab') {
        keyTap('tab');
      } else if (command === 'esc') {
        keyTap('escape');
      } else if (command.startsWith('delay:')) {
        const delay = parseInt(command.split(':')[1]);
        console.log('Setting keyboard delay:', delay);
        setKeyboardDelay(delay);
      } else if (['up', 'down', 'left', 'right'].includes(command)) {
        keyTap(command);
      } else if (command.startsWith('key:')) {
        const key = command.split(':')[1];
        keyTap(key);
      }
    } else {
      console.log('Typing string:', keystroke);
      typeString(keystroke);
    }
  }
  console.log('Keystroke execution completed');
}