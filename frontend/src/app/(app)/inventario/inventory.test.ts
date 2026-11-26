import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STOCK_FILTERS,
  initialSalePrice,
  parseSaleQuantity,
  parseStockQuantity,
  projectedProfitBreakdown,
  stockLabel,
  stockWhere,
} from './inventory';

describe('stockWhere', () => {
  it('shows only Disponibles by default', () => {
    expect(stockWhere(DEFAULT_STOCK_FILTERS)).toEqual({ quantity: { _gt: 0 } });
  });
  it('filters Agotados (cantidad 0)', () => {
    expect(stockWhere({ ...DEFAULT_STOCK_FILTERS, availability: 'sold_out' })).toEqual({ quantity: { _eq: 0 } });
  });
  it('has no conditions for everything', () => {
    expect(stockWhere({ availability: 'all', gender: null, search: '  ' })).toEqual({});
  });
  it('combines género and a literal, case-insensitive name search', () => {
    expect(stockWhere({ availability: 'all', gender: 'women', search: ' 50%_off ' })).toEqual({
      gender: { _eq: 'women' },
      name: { _ilike: '%50\\%\\_off%' },
    });
  });
});

describe('parseStockQuantity', () => {
  it('accepts whole numbers ≥ 0', () => {
    expect(parseStockQuantity('0')).toBe(0);
    expect(parseStockQuantity(' 12 ')).toBe(12);
  });
  it('rejects negatives, decimals and text', () => {
    for (const text of ['-1', '1.5', '', 'dos']) expect(parseStockQuantity(text)).toBeNull();
  });
});

describe('parseSaleQuantity', () => {
  it('accepts 1..stock', () => {
    expect(parseSaleQuantity('1', 3)).toBe(1);
    expect(parseSaleQuantity('3', 3)).toBe(3);
  });
  it('rejects 0, more than the stock and non-integers', () => {
    for (const text of ['0', '4', '1.5', '']) expect(parseSaleQuantity(text, 3)).toBeNull();
  });
});

describe('initialSalePrice', () => {
  it('prefills the price when the target Venta has the same currency', () => {
    expect(initialSalePrice(15000, 'CRC', 'CRC')).toBe('15000');
    expect(initialSalePrice(12.5, 'USD', 'USD')).toBe('12.5');
  });
  it('leaves it empty for another currency (no conversion in the frontend)', () => {
    expect(initialSalePrice(30, 'USD', 'CRC')).toBe('');
  });
});

describe('projectedProfitBreakdown', () => {
  it('shows the Utilidad actual and the Inventario disponible in ₡ and $', () => {
    expect(
      projectedProfitBreakdown({ profit_usd: 70, profit_crc: 35000, stock_value_usd: 30, stock_value_crc: 14000 }),
    ).toBe('Utilidad actual ₡35.000 ($70.00) + Inventario disponible ₡14.000 ($30.00)');
  });
  it('keeps the sign of a negative Utilidad', () => {
    expect(projectedProfitBreakdown({ profit_usd: -10, profit_crc: -5000, stock_value_usd: 0, stock_value_crc: 0 })).toBe(
      'Utilidad actual -₡5.000 (-$10.00) + Inventario disponible ₡0 ($0.00)',
    );
  });
});

describe('stockLabel', () => {
  it('pluralizes and marks Agotado', () => {
    expect(stockLabel(0)).toBe('Agotado');
    expect(stockLabel(1)).toBe('1 disponible');
    expect(stockLabel(4)).toBe('4 disponibles');
  });
});
