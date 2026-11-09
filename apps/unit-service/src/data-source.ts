import 'reflect-metadata';
import { DataSource } from 'typeorm';
import 'reflect-metadata';
import { loadEnvFile } from 'node:process';


loadEnvFile('.env');
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,

  schema: 'public',
  migrationsTableName: 'migrations',

  synchronize: false,
  logging: false,
  entities: [],
  migrations: ['migrations/*.ts'],
});