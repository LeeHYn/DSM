import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SessionVerifierService } from './session-verifier.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService, JwtAuthGuard, SessionVerifierService],
  controllers: [AuthController],
  exports: [JwtModule, JwtAuthGuard, SessionVerifierService],
})
export class AuthModule {}
