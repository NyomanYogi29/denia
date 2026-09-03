import { defineConfig } from 'drizzle-kit';


export default defineConfig({
    out: './drizzle',
    schema: './src/core/db/schema.ts',
    dialect: 'sqlite',
    dbCredentials: {
        url: './data/bot.db'
    }
})