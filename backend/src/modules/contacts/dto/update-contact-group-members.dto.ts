import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateContactGroupMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  contactIds!: string[];
}