import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PreviewMessageTemplateDto {
  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1600)
  content?: string;

  @IsUUID('4')
  contactId!: string;
}
