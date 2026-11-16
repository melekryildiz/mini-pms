import {
  ServiceUnavailableException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

/**
 * Controller import edilirken UnitService de yüklenir. Burada repository DI
 * davranışını test etmediğimiz ve mevcut Jest CJS ortamı @nestjs/typeorm ESM
 * girişini doğrudan okuyamadığı için decorator'ı zararsız bir taklitleyoruz.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

import type { UnitTopologyService } from '../topology/unit-topology.service.js';
import { UnitRpcController } from './unit-rpc.controller.js';
import type { UnitOrchestrator } from './unit.orchestrator.js';
import type { UnitService } from './unit.service.js';

describe('UnitRpcController topology patterns', () => {
  const getUnitTree = jest.fn();
  const getUnitPath = jest.fn();
  const getNavigationRoots = jest.fn();
  const getNavigationChildren = jest.fn();
  const searchNavigationByCode = jest.fn();

  let controller: UnitRpcController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new UnitRpcController(
      {
        getNavigationRoots,
        getNavigationChildren,
        searchNavigationByCode,
      } as unknown as UnitService,
      {} as UnitOrchestrator,
      {
        getUnitTree,
        getUnitPath,
      } as unknown as UnitTopologyService,
    );
  });

  it('unit.getTree payload id değerini karşılaştırma servisine aktarır', async () => {
    const response = { data: { id: '10' } };
    getUnitTree.mockResolvedValue(response);

    await expect(controller.getUnitTree({ id: '10' })).resolves.toBe(response);
    expect(getUnitTree).toHaveBeenCalledWith('10');
  });

  it('unit.getPath payload id değerini karşılaştırma servisine aktarır', async () => {
    const response = { data: [{ id: '10' }, { id: '20' }] };
    getUnitPath.mockResolvedValue(response);

    await expect(controller.getUnitPath({ id: '20' })).resolves.toBe(response);
    expect(getUnitPath).toHaveBeenCalledWith('20');
  });

  it('Neo4j/PostgreSQL uyuşmazlığındaki 503 durumunu RPC sınırında korur', async () => {
    getUnitTree.mockRejectedValue(
      new ServiceUnavailableException(
        'Neo4j and PostgreSQL topology results do not match',
      ),
    );

    try {
      await controller.getUnitTree({ id: '10' });
      throw new Error('RPC call was expected to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toEqual({
        statusCode: 503,
        message: 'Neo4j and PostgreSQL topology results do not match',
      });
    }
  });

  it('root sorgusunu wrapper response içinde döndürür', async () => {
    const roots = [
      {
        id: '10',
        parentId: null,
        code: 'SUB-10',
        hasChildren: true,
      },
    ];
    getNavigationRoots.mockResolvedValue(roots);

    await expect(controller.getNavigationRoots()).resolves.toEqual({
      data: roots,
    });

    expect(getNavigationRoots).toHaveBeenCalledTimes(1);
  });

  it('children payload parentId değerini service katmanına aktarır', async () => {
    const children = [
      {
        id: '20',
        parentId: '10',
        code: 'TR-20',
        hasChildren: false,
      },
    ];
    getNavigationChildren.mockResolvedValue(children);

    await expect(
      controller.getNavigationChildren({ parentId: '10' }),
    ).resolves.toEqual({
      parentId: '10',
      data: children,
    });

    expect(getNavigationChildren).toHaveBeenCalledWith('10');
  });

  it('code aramasını normalize edip string limiti number değerine çevirir', async () => {
    const matches = [
      {
        id: '20',
        code: 'TR-20',
        hasChildren: false,
      },
    ];
    searchNavigationByCode.mockResolvedValue(matches);

    await expect(
      controller.searchNavigationByCode({
        code: '  TR-20  ',
        limit: '15',
      }),
    ).resolves.toEqual({
      query: 'TR-20',
      data: matches,
    });

    expect(searchNavigationByCode).toHaveBeenCalledWith('TR-20', 15);
  });
});
