#!/usr/bin/env node

import process from "node:process";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_TOP_K,
} from "./constants.js";
import { indexRepository } from "./indexer.js";
import { getRepoRoot } from "./paths.js";
import { retrieveContext } from "./retriever.js";

function usage() {
  return `Usage:
  node rag/cli.js index [options]
  node rag/cli.js query "<text>" [options]

Commands:
  index                  Build/update local vector store
  query                  Retrieve top matching chunks

Options:
  --store <path>         Override store path (default: .rag/vector-store.json)
  --chunk-size <n>       Chunk size for indexing (default: ${DEFAULT_CHUNK_SIZE})
  --chunk-overlap <n>    Chunk overlap for indexing (default: ${DEFAULT_CHUNK_OVERLAP})
  --top-k <n>            Number of query results (default: ${DEFAULT_TOP_K})
  --no-local             Skip optional local files (like .AGENTS.md)
  --json                 Print JSON only
`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] || "";
  const options = {
    store: "",
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    topK: DEFAULT_TOP_K,
    includeOptionalLocal: true,
    json: false,
  };
  const positionals = [];

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];

    if (token === "--store") {
      options.store = args[i + 1] || "";
      i += 1;
      continue;
    }

    if (token === "--chunk-size") {
      options.chunkSize = Number(args[i + 1]) || DEFAULT_CHUNK_SIZE;
      i += 1;
      continue;
    }

    if (token === "--chunk-overlap") {
      options.chunkOverlap = Number(args[i + 1]) || DEFAULT_CHUNK_OVERLAP;
      i += 1;
      continue;
    }

    if (token === "--top-k") {
      options.topK = Number(args[i + 1]) || DEFAULT_TOP_K;
      i += 1;
      continue;
    }

    if (token === "--no-local") {
      options.includeOptionalLocal = false;
      continue;
    }

    if (token === "--json") {
      options.json = true;
      continue;
    }

    positionals.push(token);
  }

  return {
    command,
    options,
    positionals,
  };
}

function printQueryResults(result) {
  console.log(`RAG query: ${result.query}`);
  console.log(`Store: ${result.store_path}`);
  console.log(`Chunks indexed: ${result.total_chunks}`);

  if (!result.results.length) {
    console.log("No matching chunks found.");
    return;
  }

  for (let i = 0; i < result.results.length; i += 1) {
    const item = result.results[i];
    console.log(
      `${i + 1}. score=${item.score} ${item.file_path}:${item.start_line}-${item.end_line}`
    );
    console.log(`   ${item.excerpt}`);
  }
}

async function run() {
  const { command, options, positionals } = parseArgs(process.argv);
  const repoRoot = getRepoRoot();

  if (!command || command === "--help" || command === "-h") {
    console.error(usage());
    process.exit(command ? 0 : 1);
  }

  if (command === "index") {
    const indexed = await indexRepository({
      repoRoot,
      storePath: options.store,
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
      includeOptionalLocal: options.includeOptionalLocal,
    });

    const payload = indexed.payload;
    const output = {
      ok: true,
      store_path: indexed.storePath,
      files_indexed: payload.files.length,
      chunks_indexed: payload.chunks.length,
      missing_patterns: indexed.missingPatterns,
      indexed_at: payload.generated_at,
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log(`Indexed ${output.files_indexed} files into ${output.chunks_indexed} chunks.`);
    console.log(`Store written to: ${output.store_path}`);
    if (output.missing_patterns.length) {
      console.log(`Skipped missing patterns: ${output.missing_patterns.join(", ")}`);
    }
    return;
  }

  if (command === "query") {
    const query = positionals.join(" ").trim();
    if (!query) {
      throw new Error("Query text is required. Example: npm run rag:query -- \"delete token\"");
    }

    const result = await retrieveContext({
      repoRoot,
      storePath: options.store,
      query,
      topK: options.topK,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printQueryResults(result);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(`RAG error: ${error.message}`);
  process.exit(1);
});
