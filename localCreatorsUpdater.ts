require('dotenv').config()
import { db } from './db'

async function run() {
	await db.none(`
		CREATE EXTENSION IF NOT EXISTS dblink;

		-- Drop constraints
		ALTER TABLE packs
			DROP CONSTRAINT packs_creator_fkey;
		ALTER TABLE themes
			DROP CONSTRAINT themes_creator_fkey;
			
		-- Clear table
		truncate table creators;
		
		-- Fetch from prod db
		INSERT INTO creators
		SELECT *
		FROM dblink('hostaddr=${process.env.POSTGRES_PROD_HOST} dbname=${process.env.POSTGRES_PROD_DB} user=${process.env.POSTGRES_PROD_USER} password=${process.env.POSTGRES_PROD_PASSWORD}',
				'select * from creators')
			AS t1(role varchar,
				bio varchar,
				joined timestamp without time zone,
				discord_user json,
				banner_image varchar,
				logo_image varchar,
				profile_color varchar,
				id varchar,
				has_accepted boolean,
				backup_code varchar,
				old_ids varchar[],
				liked_creators varchar[],
				liked_layouts uuid[],
				liked_themes uuid[],
				liked_packs uuid[]
				);
			
		-- Recreate constraints
		ALTER TABLE packs 
			ADD CONSTRAINT packs_creator_fkey FOREIGN KEY (creator_id) REFERENCES creators (id);
		ALTER TABLE themes 
			ADD CONSTRAINT themes_creator_fkey FOREIGN KEY (creator_id) REFERENCES creators (id);
	`)
}

run()
