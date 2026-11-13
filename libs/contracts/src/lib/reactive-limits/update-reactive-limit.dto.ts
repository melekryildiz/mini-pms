import { IsNumberString } from 'class-validator';

export class UpdateReactiveLimitDto {
  @IsNumberString()
  limit_value!: string;
}
