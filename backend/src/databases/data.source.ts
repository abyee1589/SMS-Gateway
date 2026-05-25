import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../modules/users/entities/user.entity';
import { SmsMessage } from '../modules/sms/entities/sms.entity';
import { Tenant } from '../modules/tenants/entities/tenant.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, SmsMessage, Tenant],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});