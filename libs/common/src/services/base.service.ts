import {Repository, FindOptionsWhere,FindOptionsOrder, DeepPartial} from 'typeorm';
import { IBaseEntity } from '../interfaces/base-entity.interface.js';

export abstract class BaseService <T extends IBaseEntity> {
    constructor(
        protected readonly repository:Repository<T>,
    ){}

    async create (data: DeepPartial<T>, created_by: string): Promise<T> { 
        const entity= this.repository.create({...data,created_by,} as DeepPartial<T>);

        return await this.repository.save(entity);
    }

    async findOne(id: string): Promise <T | null>{
        return await this.repository.findOne({
            where: {id} as FindOptionsWhere<T>,
        });
    }
    
    async update(id: string, data: DeepPartial<T>, updated_by: string): Promise<T| null>{
        const entity=await this.findOne(id);

        if(!entity){
            return null;
        }

        const updatedEntity = this.repository.merge(entity, data);
        updatedEntity.updated_by=updated_by;
        return await this.repository. save(updatedEntity);
    }

    async softDelete(id: string, deleted_by: string): Promise<boolean> {
        const entity = await this.findOne(id);

        if (!entity) {
            return false;
        }

        entity.deleted_at = new Date();
        entity.deleted_by = deleted_by;

        await this.repository.save(entity);

        return true;
    }

    async getList(
        page: number = 1,
        limit: number = 10,
        sortBy: keyof T = 'id' as keyof T,
        sortOrder: 'ASC' | 'DESC' = 'ASC',
        filters?: FindOptionsWhere<T>,
    ): Promise<{ data: T[]; total: number }> {

        if (!Number.isInteger(page) || page < 1) {
            throw new Error('Page must be a positive integer');
        }

        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new Error('Limit must be between 1 and 100');
        }

        const [data, total] = await this.repository.findAndCount({
            where: filters,
            skip: (page - 1) * limit,
            take: limit,
            order: {
                [sortBy]: sortOrder,
            } as FindOptionsOrder<T>,
        });

        return { data, total };
    }


}

