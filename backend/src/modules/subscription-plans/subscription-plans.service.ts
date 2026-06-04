import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SubscriptionPlan,
  SubscriptionPlanStatus,
} from './entities/subscription-plan.entity';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

@Injectable()
export class SubscriptionPlansService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly plansRepository: Repository<SubscriptionPlan>,
  ) {}

  async findAll() {
    return this.plansRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findActive() {
    return this.plansRepository.find({
      where: {
        status: SubscriptionPlanStatus.ACTIVE,
      },
      order: {
        price: 'ASC',
      },
    });
  }

  async findById(id: string) {
    const plan = await this.plansRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    return plan;
  }

  async create(dto: CreateSubscriptionPlanDto) {
    const name = dto.name.trim();

    const existing = await this.plansRepository.findOne({
      where: { name },
    });

    if (existing) {
      throw new ConflictException('A plan with this name already exists');
    }

    const plan = this.plansRepository.create({
      name,
      smsQuota: dto.smsQuota,
      durationDays: dto.durationDays,
      price: dto.price,
      status: dto.status ?? SubscriptionPlanStatus.ACTIVE,
      description: dto.description?.trim() || null,
    });

    return this.plansRepository.save(plan);
  }

  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    const plan = await this.findById(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      const existing = await this.plansRepository.findOne({
        where: { name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException('A plan with this name already exists');
      }

      plan.name = name;
    }

    if (dto.smsQuota !== undefined) plan.smsQuota = dto.smsQuota;
    if (dto.durationDays !== undefined) plan.durationDays = dto.durationDays;
    if (dto.price !== undefined) plan.price = dto.price;
    if (dto.status !== undefined) plan.status = dto.status;
    if (dto.description !== undefined) {
      plan.description = dto.description.trim() || null;
    }

    return this.plansRepository.save(plan);
  }

  async activate(id: string) {
    return this.update(id, {
      status: SubscriptionPlanStatus.ACTIVE,
    });
  }

  async deactivate(id: string) {
    return this.update(id, {
      status: SubscriptionPlanStatus.INACTIVE,
    });
  }
}
