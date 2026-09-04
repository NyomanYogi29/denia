#!/usr/bin/env bun
import { greet } from "@/core/cli-test"
import { parseArgs } from "util"

const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        name: {
            type: "string",
            short: "n",
            default: "Dunia"
        },
        upper: {
            type: "boolean",
            short: "u",
            default: false,
        },
        help: {
            type: "boolean",
            short: "h"
        },
    },
    strict: true,
    allowPositionals: true
})

if (values.help) {
    console.log(`
        Penggunaan:
            my-cli [options]
        
        Opsi:
            -n, --name <string> Nama yang ingin disapa (default: "Dunia")
            -u, --upper         Cetak teks dalam huruf kapital
            -h, --help          Tampilkan bantuan
    `);
    process.exit(0)
}

const message = greet(values.name!, values.upper);
console.log(message);