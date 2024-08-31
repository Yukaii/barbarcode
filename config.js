import { parse } from 'toml';
import { readFileSync } from 'fs';
import { program } from 'commander';

export function loadConfig() {
  const config = parse(readFileSync('./config.toml', 'utf-8'));

  program
    .version('1.0.0')
    .option('-p, --port <number>', 'port to run the server on', 8080)
    .option('-s, --session <string>', 'session identifier', "default")
    .parse(process.argv);

  const options = program.opts();

  if (!options.session || !config.sessions[options.session]) {
    console.error(`Error: Session "${options.session}" not found in config.`);
    process.exit(1);
  }

  return { config, options };
}