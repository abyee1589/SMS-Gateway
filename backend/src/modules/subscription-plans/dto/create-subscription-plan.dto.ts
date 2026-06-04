import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SubscriptionPlanStatus } from '../entities/subscription-plan.entity';

export class CreateSubscriptionPlanDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  smsQuota!: number;

  @IsInt()
  @Min(1)
  durationDays!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsEnum(SubscriptionPlanStatus)
  status?: SubscriptionPlanStatus;

  @IsOptional()
  @IsString()
  description?: string;
}
