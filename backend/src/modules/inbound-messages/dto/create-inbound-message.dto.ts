import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInboundMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  from!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  to?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerMessageId?: string;
}