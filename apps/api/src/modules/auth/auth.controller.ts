import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../common/prisma.service';
import { AuthService } from './auth.service';

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const RefreshSchema = z.object({ refreshToken: z.string().min(20) });
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, 'Mínimo 10 caracteres')
    .regex(/[A-Za-z]/, 'Debe incluir letras')
    .regex(/\d/, 'Debe incluir números'),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(LoginSchema)) b: z.infer<typeof LoginSchema>) {
    return this.auth.login(b.email, b.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(RefreshSchema)) b: z.infer<typeof RefreshSchema>) {
    return this.auth.refresh(b.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshSchema)) b: z.infer<typeof RefreshSchema>) {
    await this.auth.logout(b.refreshToken);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ChangePasswordSchema)) b: z.infer<typeof ChangePasswordSchema>,
  ) {
    await this.auth.changePassword(user.id, b.currentPassword, b.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, email: true, fullName: true, mustChangePassword: true, role: { select: { code: true, name: true } } },
    });
    return { ...u, permissions: user.permissions, siteIds: user.siteIds };
  }
}
