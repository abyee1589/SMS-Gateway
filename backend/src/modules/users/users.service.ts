import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async deleteUser(userId: string, currentUser: { id: string; tenantId: string }) {
    const user = await this.usersRepository.findOne({
      where: { id: userId, tenantId: currentUser.tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // prevent deleting yourself (very important)
    if (user.id === currentUser.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.usersRepository.remove(user);

    return { success: true };
  }

  async findAll(tenantId: string) {
    return this.usersRepository.find({
      where: { tenantId },
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

  async updateRole(id: string, tenantId: string, role: UserRole) {
    const user = await this.findByIdWithinTenant(id, tenantId);

    user.role = role;
    return this.usersRepository.save(user);
  }

  async updateStatus(id: string, tenantId: string, isActive: boolean) {
    const user = await this.findByIdWithinTenant(id, tenantId);

    user.isActive = isActive;
    return this.usersRepository.save(user);
  }

  async findByEmail(email: string, includePassword = false) {
    const qb = this.usersRepository.createQueryBuilder('user');

    if (includePassword) {
      qb.addSelect('user.password');
    }

    qb.where('LOWER(user.email) = LOWER(:email)', { email });

    return qb.getOne();
  }
}