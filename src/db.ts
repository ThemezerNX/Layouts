require('dotenv').config()
const pgPromise = require('pg-promise')

const config = {
	host: process.env.POSTGRES_HOST,
	port: process.env.POSTGRES_PORT,
	database: process.env.POSTGRES_DB,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD,
}

export const pgp = pgPromise({ capSQL: true, schema: process.env.POSTGRES_SCHEMA })
export const db = pgp(config)
