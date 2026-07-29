import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: {
    email: string;
    password: string;
    tenantId: string;
    role?: UserRole;
  }) {
    const existingUser = await this.findByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException('Email is already in use');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const newUser = this.usersRepository.create({
      email: createUserDto.email.toLowerCase(),
      password: hashedPassword,
      role: createUserDto.role ?? UserRole.USER,
      isActive: true,
      tenantId: createUserDto.tenantId,
    });

    return this.usersRepository.save(newUser);
  }

  async findAll(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant is required');
    }

    return this.usersRepository.find({
      where: {
        tenantId,
        role: In([UserRole.ADMIN, UserRole.USER]),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllForPlatform() {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string) {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByIdWithinTenant(id: string, tenantId: string) {
    const user = await this.usersRepository.findOne({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string, includePassword = false) {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      select: includePassword
        ? [
            'id',
            'email',
            'password',
            'role',
            'isActive',
            'tenantId',
            'createdAt',
            'updatedAt',
          ]
        : undefined,
    });
  }

  async updateRole(id: string, tenantId: string, role: UserRole) {
    const user = await this.findByIdWithinTenant(id, tenantId);

    user.role = role;

    return this.usersRepository.save(user);
  }

  async updateRoleAsSuperAdmin(id: string, role: UserRole) {
    const user = await this.findById(id);

    user.role = role;

    return this.usersRepository.save(user);
  }

  async updateStatus(id: string, tenantId: string, isActive: boolean) {
    const user = await this.findByIdWithinTenant(id, tenantId);

    user.isActive = isActive;

    return this.usersRepository.save(user);
  }

  async updateStatusAsSuperAdmin(id: string, isActive: boolean) {
    const user = await this.findById(id);

    user.isActive = isActive;

    return this.usersRepository.save(user);
  }

  async deleteUser(userId: string, currentUser: { id: string; tenantId: string }) {
    const user = await this.usersRepository.findOne({
      where: { id: userId, tenantId: currentUser.tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === currentUser.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.usersRepository.remove(user);

    return { success: true };
  }

  async deleteUserAsSuperAdmin(userId: string, currentUserId: string) {
    const user = await this.findById(userId);

    if (user.id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.usersRepository.remove(user);

    return { success: true };
  }
}