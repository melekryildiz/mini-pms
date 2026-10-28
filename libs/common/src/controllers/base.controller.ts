import { IBaseEntity } from '../interfaces/base-entity.interface.js';
import { BaseService } from '../services/base.service.js';
import { IResponse } from '../interfaces/response.interface.js';
import type { DeepPartial, FindOptionsWhere  } from 'typeorm';

export abstract class BaseController<T extends IBaseEntity> {
    constructor(
        protected readonly service: BaseService<T>,
    ) {}

    async findOne(id: string): Promise<IResponse<T | null>> {
        const entity= await this.service.findOne(id);

        return {
            success: entity !== null,
            data: entity,
            message: entity
            ? 'Record found successfully'
            : 'Record not found',
        };
    }

    async create(
        data: DeepPartial<T>,
        created_by: string,
    ): Promise<IResponse<T>> {

        const entity = await this.service.create(data, created_by);

        return {
            success: true,
            data: entity,
            message: 'Record created successfully',
        };
    }

     async update(
        id: string, 
        data: DeepPartial<T>,
        updated_by: string
    ): Promise<IResponse<T| null>>{
        const entity = await this.service.update(id,data,updated_by);

        return {
            success: true,
            data: entity,
            message: entity
            ? 'Record updated successfully'
            : 'Record not found',
        };
    }

    async softDelete (
        id: string,
        data: DeepPartial<T>,
        deleted_by: string
    ): Promise <IResponse<boolean>> {
        const deleted= await this.service.softDelete(id,deleted_by);
        return {
            success: deleted,
            data: deleted,
            message: deleted
            ? 'Record deleted successfully'
            : 'Record not found',
        };

    }

    async getList(
        page: number = 1,
        limit: number = 10,
        sortBy: keyof T = 'id' as keyof T,
        sortOrder: 'ASC' | 'DESC' = 'ASC',
        filters?: FindOptionsWhere<T>,
    ): Promise<IResponse<{ data: T[]; total: number }>> {

        const result = await this.service.getList(
            page,
            limit,
            sortBy,
            sortOrder,
            filters,
        );

        return {
            success: true,
            data: result,
            message: 'Records retrieved successfully',
        };
    }

}


