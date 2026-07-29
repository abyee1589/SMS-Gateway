import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class QueryMessageTemplatesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
