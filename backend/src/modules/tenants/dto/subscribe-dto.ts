import { IsUUID } from 'class-validator';

export class SubscribeTenantDto {
  @IsUUID()
  planId!: string;
}