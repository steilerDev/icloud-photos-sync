#!/usr/bin/env tsx
// This script generates the CLI reference documentation from the CLI options - if doc root path is provided, it will write the output to the provided path, otherwise it will print to stdout

import {Argument, Help} from 'commander';
import fs from 'fs/promises';
import {Liquid} from 'liquidjs';
import path from 'path';
import {argParser} from '../src/app/factory.js';

const outputPath = process.argv.pop() + `/user-guides/cli.md`;

/**
 * The program from the app factory
 */
const program = argParser(() => {});
/**
 * Commander js helper to format
 */
const helper = new Help();

type GlobalCommand = {
    name: string,
    usage: string,
    description: string,
    arguments?: {
        name: string,
        description: string,
        required: boolean
    }[]
}

type GlobalOption = {
    pretty: string,
    required: boolean,
    type: string,
    description: string,
    long?: string,
    short?: string,
    environment?: string,
    defaultValue?: string,
    choices?: string,
    isBoolean: boolean
}

const templateInput = {
    description: program.description(),
    commandName: program.name(),
    helpCommandName: (program as any)._helpCommandName,
    synopsis: helper.commandUsage(program),
    globalCommands: [] as GlobalCommand[],
    globalOptions: [] as GlobalOption[],
};

for (const option of program.options) {
    templateInput.globalOptions.push(
        {
            pretty: option.long!.slice(2),
            long: option.long!,
            short: option.short!,
            environment: (option as any).envVar,
            required: option.mandatory,
            defaultValue: option.defaultValueDescription ?? option.defaultValue?.toString(),
            type: (option.flags.match(/[<[](.*)[>\]]/) ?? [``, `boolean`])[1],
            description: option.description,
            choices: ((option as any).argChoices as string[])?.map(choice => `\`${choice}\``).join(`, `),
            isBoolean: option.isBoolean()
        },
    );
}

for (const command of program.commands) {
    templateInput.globalCommands.push(
        {
            name: command.name(),
            usage: templateInput.commandName + ` [options] ` + command.name() + ((command as any)._args.length > 0 ? ` [arguments]` : ``),
            description: command.description(),
            arguments: [],
        },
    );

    for (const argument of (command as any)._args as Argument[]) {
        templateInput.globalCommands[templateInput.globalCommands.length - 1].arguments!.push(
            {
                name: argument.name(),
                description: argument.description,
                required: argument.required,
            },
        );
    }
}

templateInput.globalOptions.sort((a, b) => a.pretty.localeCompare(b.pretty));
templateInput.globalCommands.sort((a, b) => a.name.localeCompare(b.name));

const engine = new Liquid();
const template = await engine.parseFile(`./build/cli-reference.liquid`);
const output = await engine.render(template, templateInput);

try {
    await fs.stat(path.dirname(outputPath));
    await fs.writeFile(outputPath, output, {encoding: `utf-8`});
} catch (err) {
    console.error(`Unable to write to file: ${(err as Error).message}`);
    console.log();
    console.log(output);
}