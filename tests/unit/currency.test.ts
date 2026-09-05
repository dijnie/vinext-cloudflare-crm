import { describe, expect, it } from "vitest";
import { CURRENCIES, CURRENCY_CODES, MAX_AMOUNT_MINOR, formatMinor, minorUnitsOf } from "@/modules/currency/currency-catalog";
import { currencyCodeSchema, rateSchema } from "@/modules/currency/currency-contracts";
import { canonicalRate, conversionFields, convertMinor, rateMantissa } from "@/modules/currency/conversion-service";

describe("exact currency arithmetic",()=>{
  it("supports precisely eleven currencies and identity minor units",()=>{
    expect(CURRENCY_CODES).toEqual(["USD","EUR","JPY","GBP","CNY","AUD","CAD","CHF","HKD","SGD","ZAR"]);
    expect(CURRENCIES).toHaveLength(11);
    for(const code of CURRENCY_CODES) {
      expect(currencyCodeSchema.parse(" "+code.toLowerCase()+" ")).toBe(code);
      expect(minorUnitsOf(code)).toBe(code==="JPY"?0:2);
      expect(convertMinor(MAX_AMOUNT_MINOR,code,code,"1")).toBe(MAX_AMOUNT_MINOR);
    }
    expect(currencyCodeSchema.safeParse("VND").success).toBe(false);
  });
  it("rounds half up at the destination minor unit without floating point loss",()=>{
    expect(convertMinor(1,"USD","USD","0.4999999999")).toBe(0);
    expect(convertMinor(1,"USD","USD","0.5")).toBe(1);
    expect(convertMinor(150,"USD","JPY","1")).toBe(2);
    expect(convertMinor(149,"USD","JPY","1")).toBe(1);
    expect(convertMinor(1,"JPY","USD","0.005")).toBe(1);
    expect(convertMinor(0,"EUR","USD","9999999999.9999999999")).toBe(0);
    expect(rateMantissa("1.2345678901")).toBe(12345678901n);
    expect(canonicalRate(" 1.2300000000 ")).toBe("1.23");
    expect(convertMinor(99_999_999_999_999,"USD","EUR","1.0000000001")).toBe(100_000_000_009_999);
  });
  it("rejects invalid rates, unsupported money and overflow",()=>{
    for(const rate of ["0","0.0000000000","-1","NaN","Infinity","1e2","01","1.12345678901","10000000000"]) expect(rateSchema.safeParse(rate).success,rate).toBe(false);
    for(const amount of [-1,0.1,NaN,Infinity,MAX_AMOUNT_MINOR+1]) expect(()=>convertMinor(amount,"USD","EUR","1")).toThrow();
    expect(()=>convertMinor(1,"VND","USD","1")).toThrow();
    expect(()=>convertMinor(MAX_AMOUNT_MINOR,"JPY","USD","9999999999")).toThrow();
  });
  it("keeps absent conversion fully null and formats integer totals beyond safe-number range",()=>{
    expect(conversionFields(100,"EUR","USD",{})).toEqual({baseAmountMinor:null,baseCurrency:null,fxRate:null,fxRateAt:null,rateSource:null});
    expect(conversionFields(null,"USD","USD",{USD:{rate:"1",asOf:"2026-09-04T00:00:00.000Z",source:"identity"}}).baseAmountMinor).toBeNull();
    expect(formatMinor("900719925474099199","USD","en-US")).toBe("$9,007,199,254,740,991.99");
    expect(formatMinor(123,"JPY","en-US")).toBe("¥123");
  });
});
