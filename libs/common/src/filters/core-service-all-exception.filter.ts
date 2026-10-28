import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class CoreServiceAllExceptionFilter implements ExceptionFilter{
    catch(exception: unknown, host: ArgumentsHost){
         const response= host.switchToHttp().getResponse();

         const status= 
            exception instanceof HttpException ? 
            exception.getStatus()
            :HttpStatus.INTERNAL_SERVER_ERROR;
        
            const message=
                exception instanceof HttpException ?
                exception.message
                : 'INTERNAL_SERVER_ERROR';
            
            response.status(status).json({
                succes: false,
                data: null,
                message,
            });
                
    }
     
        
}