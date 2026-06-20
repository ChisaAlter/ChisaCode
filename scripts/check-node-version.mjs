#!/usr/bin/env node

const actual = process.version.replace(/^v/, "");

console.log(`Active Node.js version: v${actual}`);
console.log("No exact Node.js version is enforced by this repository.");
