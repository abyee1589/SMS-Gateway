import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  recipient!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1600)
  content!: string;

  @IsOptional()
  @IsBoolean()
  forceSend?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}