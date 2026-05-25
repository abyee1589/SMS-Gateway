import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/lgoin.dto';
import { TenantsService } from '../tenants/tenants.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {

constructor(
  private readonly usersService: UsersService,
  private readonly jwtService: JwtService,
  private readonly tenantsService: TenantsService,
) {}

  async register(dto: RegisterDto) {
  const existingUser = await this.usersService.findByEmail(dto.email);

  if (existingUser) {
    throw new ConflictException('Email is already in use');
  }

  const tenantName = dto.email.split('@')[0];
  const tenant = await this.tenantsService.create(`${tenantName}'s Workspace`);

  const user = await this.usersService.create({
    email: dto.email,
    password: dto.password,
    tenantId: tenant.id,
  });

  return this.buildAuthResponse(user);
}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email, true);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }
    
    const passwordMatches = await bcrypt.compare(dto.password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    return this.usersService.findById(userId);
  }

  private async buildAuthResponse(user: User) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      accessToken,
    };
  }
}