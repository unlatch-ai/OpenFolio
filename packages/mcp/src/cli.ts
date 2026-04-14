#!/usr/bin/env node
import { Command } from "commander";
import { OpenFolioCore } from "@openfolio/core";
import { startOpenFolioMcpServer } from "./mcp-server.js";

export function createCli() {
  const program = new Command();

  program
    .name("openfolio")
    .description("Local CLI for the OpenFolio macOS app");

  program
    .command("search")
    .argument("<query>")
    .option("-l, --limit <limit>", "result limit", "10")
    .action(async (query, options) => {
      const core = new OpenFolioCore();
      const results = await core.search(query, Number(options.limit));
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    });

  program
    .command("ask")
    .argument("<query>")
    .action(async (query) => {
      const core = new OpenFolioCore();
      const response = await core.ask(query);
      process.stdout.write(`${response.answer}\n`);
    });

  program
    .command("person")
    .command("get")
    .argument("<personId>")
    .action(async (personId) => {
      const core = new OpenFolioCore();
      const person = core.getPerson(personId);
      process.stdout.write(`${JSON.stringify(person ?? null, null, 2)}\n`);
    });

  program
    .command("note")
    .command("add")
    .requiredOption("--entity-type <entityType>")
    .requiredOption("--entity-id <entityId>")
    .requiredOption("--content <content>")
    .action((options) => {
      const core = new OpenFolioCore();
      const note = core.addNote(options.entityType, options.entityId, options.content);
      process.stdout.write(`${JSON.stringify(note, null, 2)}\n`);
    });

  program
    .command("reminder")
    .command("add")
    .requiredOption("--title <title>")
    .option("--person-id <personId>")
    .option("--due-at <dueAt>")
    .action((options) => {
      const core = new OpenFolioCore();
      const reminder = core.addReminder(
        options.title,
        options.personId ?? null,
        options.dueAt ? Number(options.dueAt) : null
      );
      process.stdout.write(`${JSON.stringify(reminder, null, 2)}\n`);
    });

  program
    .command("mcp")
    .command("serve")
    .action(async () => {
      await startOpenFolioMcpServer();
    });

  return program;
}

const cli = createCli();
cli.parseAsync(process.argv);
