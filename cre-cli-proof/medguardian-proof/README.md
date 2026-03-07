# Hello World (TypeScript)

This template provides a blank TypeScript workflow example. It aims to give a starting point for writing a workflow from scratch and to get started with local simulation.

Steps to run the example

## 1. Update .env file

If you plan to simulate chain writes, provide a private key in your local environment.
For public repositories, never commit real keys or `.env` files.
For local simulation-only runs, use a non-sensitive dummy key value in your own machine environment.

## 2. Install dependencies
```bash
bun install
```

## 3. Simulate the workflow
Run the command from <b>project root directory</b>

```bash
cre workflow simulate <path-to-workflow> --target=staging-settings
```

It is recommended to look into other existing examples to see how to write a workflow. You can generate them by running the `cre init` command.
