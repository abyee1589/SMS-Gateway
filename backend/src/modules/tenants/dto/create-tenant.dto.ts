import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  CommercialTier,
  MessagePriority,
  TenantStatus,
} from '../entities/tenant.entity';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tinNumber?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsEnum(CommercialTier)
  commercialTier?: CommercialTier;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsEnum(MessagePriority)
  messagePriority?: MessagePriority;

  @IsOptional()
  @IsInt()
  @Min(0)
  smsQuota?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}