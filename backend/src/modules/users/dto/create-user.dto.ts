export class CreateUserDto {
  email!: string;
  password!: string;
  role?: string; // The '?' means it is optional
}