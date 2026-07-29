import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateBulkMessageDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  contactIds?: string[];

  @IsOptional()
  @IsUUID('4')
  contactGroupId?: string;

  @IsString()
  @MaxLength(1600)
  content!: string;

  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @IsOptional()
  @IsBoolean()
  forceSend?: boolean;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ValidateIf((dto) => !dto.recipients?.length && !dto.contactIds?.length)
  @IsUUID('4', {
    message: 'Provide recipients, contactIds, or contactGroupId',
  })
  requiredTargetFallback?: string;
}
