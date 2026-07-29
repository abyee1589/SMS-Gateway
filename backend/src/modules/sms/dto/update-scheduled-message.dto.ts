import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateScheduledMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  recipient?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}