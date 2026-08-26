import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** bcrypt only considers the first 72 bytes of a password, so cap the input there. */
const MAX_PASSWORD_LENGTH = 72;

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MinLength(8) @MaxLength(MAX_PASSWORD_LENGTH) password!: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MinLength(6) @MaxLength(MAX_PASSWORD_LENGTH) password!: string;
}
