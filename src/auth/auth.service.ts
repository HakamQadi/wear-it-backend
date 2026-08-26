import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { JwtPayload } from '../common/types/jwt-payload';
import { LoginDto, RegisterDto } from './auth.dto';
import { User, UserDocument } from './user.schema';
import { AppError } from '../common/errors/app-error';

const BCRYPT_ROUNDS = 12;
const DUPLICATE_KEY_CODE = 11000;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.userModel.exists({ email })) {
      throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }
    try {
      const created = await this.userModel.create({
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: 'user',
      });
      return this.session(created);
    } catch (error: unknown) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) {
        throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase().trim() }).exec();
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw AppError.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return this.session(user);
  }

  async me(payload: JwtPayload) {
    const user = await this.userModel.findById(payload.sub).lean().exec();
    if (!user) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'Account not found');
    return { id: user._id.toString(), email: user.email, name: user.name, role: user.role };
  }

  private async session(user: UserDocument) {
    const payload: JwtPayload = { sub: user._id.toString(), email: user.email, role: user.role };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: payload.sub, email: user.email, name: user.name, role: user.role },
    };
  }
}
