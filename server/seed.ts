import { db } from "./db.js";
import {
  regions,
  cityCategories,
  locations,
  inventory,
  type InsertRegion,
  type InsertCityCategory,
  type InsertLocation,
  type InsertInventory,
} from "../shared/schema.js";
import { eq } from "drizzle-orm";

const defaultRegions: InsertRegion[] = [
  { name: "United States", slug: "united-states", displayOrder: 1 },
  { name: "Canada", slug: "canada", displayOrder: 2 },
  { name: "United Kingdom", slug: "united-kingdom", displayOrder: 3 },
  { name: "Europe", slug: "europe", displayOrder: 4 },
  { name: "Australia", slug: "australia", displayOrder: 5 },
  { name: "Israel", slug: "israel", displayOrder: 6 },
];

const defaultCityCategories: InsertCityCategory[] = [
  { name: "Los Angeles", slug: "los-angeles", regionId: 1, displayOrder: 1, isPopular: true, stateCode: "CA" },
  { name: "Brooklyn", slug: "brooklyn", regionId: 1, displayOrder: 2, isPopular: true, stateCode: "NY" },
  { name: "Monsey", slug: "monsey", regionId: 1, displayOrder: 3, isPopular: true, stateCode: "NY" },
  { name: "New Square", slug: "new-square", regionId: 1, displayOrder: 4, stateCode: "NY" },
  { name: "Queens", slug: "queens", regionId: 1, displayOrder: 5, stateCode: "NY" },
  { name: "Five Towns & Far Rockaway", slug: "five-towns-far-rockaway", regionId: 1, displayOrder: 6, isPopular: true, stateCode: "NY" },
  { name: "Staten Island", slug: "staten-island", regionId: 1, displayOrder: 7, stateCode: "NY" },
  { name: "West Hempstead", slug: "west-hempstead", regionId: 1, displayOrder: 8, stateCode: "NY" },
  { name: "Highland Park / Edison", slug: "highland-park-edison", regionId: 1, displayOrder: 9, stateCode: "NJ" },
  { name: "Jackson", slug: "jackson", regionId: 1, displayOrder: 10, stateCode: "NJ" },
  { name: "Lakewood", slug: "lakewood", regionId: 1, displayOrder: 11, isPopular: true, stateCode: "NJ" },
  { name: "Passaic", slug: "passaic", regionId: 1, displayOrder: 12, stateCode: "NJ" },
  { name: "Toms River", slug: "toms-river", regionId: 1, displayOrder: 13, stateCode: "NJ" },
  { name: "Toronto", slug: "toronto", regionId: 2, displayOrder: 1, isPopular: true },
  { name: "Montreal", slug: "montreal", regionId: 2, displayOrder: 2 },
  { name: "London", slug: "london", regionId: 3, displayOrder: 1, isPopular: true },
  { name: "Manchester", slug: "manchester", regionId: 3, displayOrder: 2 },
  { name: "Antwerp", slug: "antwerp", regionId: 4, displayOrder: 1 },
  { name: "Paris", slug: "paris", regionId: 4, displayOrder: 2 },
  { name: "Amsterdam", slug: "amsterdam", regionId: 4, displayOrder: 3 },
  { name: "Melbourne", slug: "melbourne", regionId: 5, displayOrder: 1 },
  { name: "Sydney", slug: "sydney", regionId: 5, displayOrder: 2 },
  { name: "Jerusalem", slug: "jerusalem", regionId: 6, displayOrder: 1, isPopular: true },
  { name: "Bnei Brak", slug: "bnei-brak", regionId: 6, displayOrder: 2, isPopular: true },
  { name: "Beit Shemesh", slug: "beit-shemesh", regionId: 6, displayOrder: 3, isPopular: true },
  { name: "Modi'in Illit", slug: "modiin-illit", regionId: 6, displayOrder: 4 },
  { name: "Beitar Illit", slug: "beitar-illit", regionId: 6, displayOrder: 5 },
  { name: "Lod", slug: "lod", regionId: 6, displayOrder: 6 },
  { name: "Afula", slug: "afula", regionId: 6, displayOrder: 7 },
  { name: "Elad", slug: "elad", regionId: 6, displayOrder: 8 },
  { name: "Givat Zeev", slug: "givat-zeev", regionId: 6, displayOrder: 9 },
  { name: "Haifa", slug: "haifa", regionId: 6, displayOrder: 10 },
  { name: "Kiryat Tivon", slug: "kiryat-tivon", regionId: 6, displayOrder: 11 },
  { name: "Kochav HaShachar", slug: "kochav-hashachar", regionId: 6, displayOrder: 12 },
  { name: "Maaleh Adumim", slug: "maaleh-adumim", regionId: 6, displayOrder: 13 },
  { name: "Neriya", slug: "neriya", regionId: 6, displayOrder: 14 },
  { name: "Telzstone/Kiryat Yearim", slug: "telzstone-kiryat-yearim", regionId: 6, displayOrder: 15 },
  { name: "Rechovot", slug: "rechovot", regionId: 6, displayOrder: 16 },
  { name: "Ashdod", slug: "ashdod", regionId: 6, displayOrder: 17 },
  { name: "Bnei Re'em", slug: "bnei-reem", regionId: 6, displayOrder: 18 },
  { name: "Miami", slug: "miami", regionId: 1, displayOrder: 14, stateCode: "FL" },
  { name: "Chicago", slug: "chicago", regionId: 1, displayOrder: 15, stateCode: "IL" },
  { name: "Baltimore", slug: "baltimore", regionId: 1, displayOrder: 16, stateCode: "MD" },
  { name: "Detroit", slug: "detroit", regionId: 1, displayOrder: 17, stateCode: "MI" },
  { name: "Cleveland", slug: "cleveland", regionId: 1, displayOrder: 18, stateCode: "OH" },
  { name: "Philadelphia", slug: "philadelphia", regionId: 1, displayOrder: 19, stateCode: "PA" },
  { name: "Teaneck", slug: "teaneck", regionId: 1, displayOrder: 20, stateCode: "NJ" },
  { name: "Kfar Chabad", slug: "kfar-chabad", regionId: 6, displayOrder: 19 },
  { name: "Tel Aviv", slug: "tel-aviv", regionId: 6, displayOrder: 20 },
  { name: "Petach Tikvah", slug: "petach-tikvah", regionId: 6, displayOrder: 21 },
  { name: "Moshav Yesodot", slug: "moshav-yesodot", regionId: 6, displayOrder: 22 },
  { name: "Shomron", slug: "shomron", regionId: 6, displayOrder: 23 },
];

interface LocationWithInventory {
  location: Omit<InsertLocation, "id">;
  inventoryByColor?: Record<string, number>;
  inventoryCount?: number;
}

const allLocations: LocationWithInventory[] = [
  { location: { name: "Los Angeles - Pico", locationCode: "#1", contactPerson: "Location Coordinator", address: "Pico Area, Los Angeles, CA", zipCode: "90035", phone: "310-465-9885", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 1, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryByColor: { red: 3, blue: 2, black: 3, white: 2 } },
  { location: { name: "Los Angeles - La Brea", locationCode: "#2", contactPerson: "Location Coordinator", address: "La Brea Area, Los Angeles, CA", zipCode: "90036", phone: "323-428-5925", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 1, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryByColor: { red: 2, blue: 3, black: 2, pink: 1 } },
  { location: { name: "Los Angeles - Valley Village", locationCode: "#3", contactPerson: "Location Coordinator", address: "Valley Village, Los Angeles, CA", zipCode: "91607", phone: "818-442-4369", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 1, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryByColor: { black: 2, white: 2, purple: 2 } },
  { location: { name: "Miami Beach", locationCode: "#4", contactPerson: "Location Coordinator", address: "Miami Beach, FL", zipCode: "33139", phone: "786-436-0060", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 41, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryByColor: { red: 3, blue: 3, black: 3, white: 2, pink: 1 } },
  { location: { name: "Chicago", locationCode: "#5", contactPerson: "Location Coordinator", address: "Chicago, IL", zipCode: "60647", phone: "773-961-5627", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 42, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryByColor: { red: 2, blue: 2, black: 3, gray: 2 } },
  { location: { name: "Baltimore - Shellydale Drive", locationCode: "#6", contactPerson: "Location Coordinator", address: "Shellydale Drive, Baltimore, MD", zipCode: "21215", phone: "847-804-6654", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 43, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Baltimore - Western Run Drive", locationCode: "#7", contactPerson: "Location Coordinator", address: "Western Run Drive, Baltimore, MD", zipCode: "21208", phone: "516-439-8099", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 43, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Detroit", locationCode: "#8", contactPerson: "Location Coordinator", address: "Detroit, MI", zipCode: "48202", phone: "248-910-4322", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 44, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "University Heights", locationCode: "#9", contactPerson: "Location Coordinator", address: "University Heights, OH", zipCode: "44118", phone: "216-206-7653", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 45, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Philadelphia", locationCode: "#10", contactPerson: "Location Coordinator", address: "Philadelphia, PA", zipCode: "19131", phone: "215-913-3467", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 46, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Bala Cynwyd Philadelphia", locationCode: "#11", contactPerson: "Location Coordinator", address: "Bala Cynwyd Area, Philadelphia, PA", zipCode: "19004", phone: "973-518-1416", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 46, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Brooklyn - Boro Park (12th Ave & 45th St)", locationCode: "#12", contactPerson: "Location Coordinator", address: "12th Ave & 45th Street, Brooklyn, NY", zipCode: "11219", phone: "631-318-0739", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Brooklyn - Boro Park (14th Ave & 40th St)", locationCode: "#13", contactPerson: "Location Coordinator", address: "14th Ave & 40th Street, Brooklyn, NY", zipCode: "11218", phone: "718-854-7574", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Brooklyn - Boro Park (16th Ave & 42nd St)", locationCode: "#14", contactPerson: "Location Coordinator", address: "16th Ave & 42nd Street, Brooklyn, NY", zipCode: "11204", phone: "718-300-0848", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Brooklyn - Crown Heights", locationCode: "#15", contactPerson: "Location Coordinator", address: "Crown Heights, Brooklyn, NY", zipCode: "11213", phone: "646-295-3077", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 12 },
  { location: { name: "Brooklyn - Flatbush (East 35th & Ave L)", locationCode: "#16", contactPerson: "Location Coordinator", address: "East 35th & Avenue L, Brooklyn, NY", zipCode: "11210", phone: "917-545-3065", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Brooklyn - Flatbush (East 9th & Ave M)", locationCode: "#17", contactPerson: "Location Coordinator", address: "East 9th & Avenue M, Brooklyn, NY", zipCode: "11230", phone: "917-301-1150", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Brooklyn - Flatbush (East 24th & Ave P)", locationCode: "#18", contactPerson: "Location Coordinator", address: "East 24th & Avenue P, Brooklyn, NY", zipCode: "11229", phone: "347-300-6172", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Brooklyn - Kensington (Avenue F)", locationCode: "#19", contactPerson: "Location Coordinator", address: "Avenue F, Kensington, Brooklyn, NY", zipCode: "11218", phone: "347-409-9479", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Brooklyn - Kensington (East 8th & Ave C)", locationCode: "#20", contactPerson: "Location Coordinator", address: "East 8th & Avenue C, Kensington, Brooklyn, NY", zipCode: "11218", phone: "347-546-9849", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 2, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Monsey - Airmont Regina Road", locationCode: "#21", contactPerson: "Location Coordinator", address: "Airmont, Regina Road, Monsey, NY", zipCode: "10952", phone: "845-558-9370", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 3, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Monsey - Butterfield Drive", locationCode: "#22", contactPerson: "Location Coordinator", address: "Butterfield Drive, Monsey, NY", zipCode: "10952", phone: "845-270-5060", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 3, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Monsey - Haverstraw", locationCode: "#23", contactPerson: "Location Coordinator", address: "Haverstraw, NY", zipCode: "10927", phone: "845-729-2035", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 3, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Monsey - Homestead Lane", locationCode: "#24", contactPerson: "Location Coordinator", address: "Homestead Lane off Rt. 306, Monsey, NY", zipCode: "10952", phone: "973-934-3775", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 3, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Monsey - Scotland Hill", locationCode: "#25", contactPerson: "Location Coordinator", address: "Scotland Hill, Monsey, NY", zipCode: "10952", phone: "347-988-4924", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 3, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Monsey - Wesley Hills", locationCode: "#26", contactPerson: "Location Coordinator", address: "Wesley Hills, NY", zipCode: "10977", phone: "914-393-2537", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 3, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "New Square", locationCode: "#27", contactPerson: "Location Coordinator", address: "New Square, NY", zipCode: "10977", phone: "845-354-6548", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 4, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Queens - Kew Gardens", locationCode: "#28", contactPerson: "Location Coordinator", address: "Kew Gardens, Queens, NY", zipCode: "11415", phone: "917-696-8217", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 5, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Five Towns & Far Rockaway", locationCode: "#29", contactPerson: "Location Coordinator", address: "Five Towns & Far Rockaway, NY", zipCode: "11691", phone: "718-309-3218", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 6, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Five Towns - Lawrence", locationCode: "#30", contactPerson: "Location Coordinator", address: "Lawrence, Five Towns, NY", zipCode: "11559", phone: "347-515-0173", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 6, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Five Towns - Cedarhurst", locationCode: "#31", contactPerson: "Location Coordinator", address: "Cedarhurst, Five Towns, NY", zipCode: "11516", phone: "516-582-1985", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 6, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Five Towns - Cedarhurst (Second Location)", locationCode: "#32", contactPerson: "Location Coordinator", address: "Cedarhurst, Five Towns, NY", zipCode: "11516", phone: "917-817-7468", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 6, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Five Towns - North Woodmere", locationCode: "#33", contactPerson: "Location Coordinator", address: "North Woodmere, Five Towns, NY", zipCode: "11581", phone: "718-869-4468", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 6, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Five Towns - Woodmere", locationCode: "#34", contactPerson: "Location Coordinator", address: "Woodmere, Five Towns, NY", zipCode: "11598", phone: "516-592-8980", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 6, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Staten Island", locationCode: "#35", contactPerson: "Location Coordinator", address: "Staten Island, NY", zipCode: "10314", phone: "347-243-2476", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 7, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 4 },
  { location: { name: "West Hempstead", locationCode: "#36", contactPerson: "Location Coordinator", address: "West Hempstead, NY", zipCode: "11552", phone: "917-496-4619", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 8, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Highland Park / Edison", locationCode: "#37", contactPerson: "Location Coordinator", address: "Highland Park / Edison, NJ", zipCode: "08837", phone: "347-203-7906", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 9, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jackson", locationCode: "#38", contactPerson: "Location Coordinator", address: "Jackson, NJ", zipCode: "08527", phone: "516-712-7735", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 10, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Lakewood - Near Beis Feiga", locationCode: "#39", contactPerson: "Location Coordinator", address: "Near Beis Feiga, Lakewood, NJ", zipCode: "08701", phone: "732-370-2609", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 12 },
  { location: { name: "Lakewood - East County Line", locationCode: "#40", contactPerson: "Location Coordinator", address: "East County Line, Lakewood, NJ", zipCode: "08701", phone: "917-861-2101", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Lakewood - West County Line", locationCode: "#41", contactPerson: "Location Coordinator", address: "West County Line, Lakewood, NJ", zipCode: "08701", phone: "732-833-3132", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Lakewood - Pine Street", locationCode: "#42", contactPerson: "Location Coordinator", address: "Pine Street, Lakewood, NJ", zipCode: "08701", phone: "732-730-5606", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Lakewood - Prospect Area", locationCode: "#43", contactPerson: "Location Coordinator", address: "Prospect Area, Lakewood, NJ", zipCode: "08701", phone: "646-647-5148", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Lakewood - Sunset & James", locationCode: "#44", contactPerson: "Location Coordinator", address: "Sunset & James, Lakewood, NJ", zipCode: "08701", phone: "718-757-8615", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Lakewood - Vine Ave", locationCode: "#45", contactPerson: "Location Coordinator", address: "Vine Ave, Lakewood, NJ", zipCode: "08701", phone: "347-563-7220", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Lakewood - Westgate", locationCode: "#46", contactPerson: "Location Coordinator", address: "Westgate, Lakewood, NJ", zipCode: "08701", phone: "718-594-7868", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 11, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 13 },
  { location: { name: "Passaic - Amsterdam Avenue", locationCode: "#47", contactPerson: "Location Coordinator", address: "Amsterdam Avenue, Passaic, NJ", zipCode: "07055", phone: "917-756-8724", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 12, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Passaic - Boulevard", locationCode: "#48", contactPerson: "Location Coordinator", address: "Boulevard, Passaic, NJ", zipCode: "07055", phone: "973-617-7947", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 12, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Passaic - Passaic Avenue", locationCode: "#49", contactPerson: "Location Coordinator", address: "Passaic Avenue, Passaic, NJ", zipCode: "07055", phone: "201-468-1928", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 12, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Toms River", locationCode: "#50", contactPerson: "Location Coordinator", address: "Toms River, NJ", zipCode: "08753", phone: "347-909-1447", email: "earmuffsgemach@gmail.com", regionId: 1, isActive: true, cityCategoryId: 13, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Jerusalem - Arzei HaBira", locationCode: "#51", contactPerson: "Location Coordinator", address: "Arzei HaBira, Jerusalem, Israel", zipCode: "91000", phone: "02-581-6171", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Jerusalem - Baka", locationCode: "#52", contactPerson: "Location Coordinator", address: "Baka, Jerusalem, Israel", zipCode: "93000", phone: "054-588-5468", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Bayit Vegan", locationCode: "#53", contactPerson: "Location Coordinator", address: "Bayit Vegan, Jerusalem, Israel", zipCode: "96000", phone: "02-538-0377", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Jerusalem - Eli HaKohen", locationCode: "#54", contactPerson: "Location Coordinator", address: "Eli HaKohen, Jerusalem, Israel", zipCode: "94000", phone: "058-321-9027", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Jerusalem - French Hill", locationCode: "#55", contactPerson: "Location Coordinator", address: "French Hill, Jerusalem, Israel", zipCode: "97000", phone: "054-485-1569", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Jerusalem - Ganei Geula", locationCode: "#56", contactPerson: "Location Coordinator", address: "Ganei Geula, Jerusalem, Israel", zipCode: "95000", phone: "058-322-4449", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Jerusalem - Givat Mordechai", locationCode: "#57", contactPerson: "Location Coordinator", address: "Givat Mordechai, Jerusalem, Israel", zipCode: "96000", phone: "054-653-5095", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Givat Shaul (Pinchas Kehati)", locationCode: "#58", contactPerson: "Location Coordinator", address: "Pinchas Kehati 1, Givat Shaul, Jerusalem, Israel", zipCode: "95000", phone: "052-769-2966", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 12 },
  { location: { name: "Jerusalem - Har Nof", locationCode: "#59", contactPerson: "Location Coordinator", address: "Har Nof, Jerusalem, Israel", zipCode: "96000", phone: "02-582-6093", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Jerusalem - Katamon", locationCode: "#60", contactPerson: "Location Coordinator", address: "Katamon, Jerusalem, Israel", zipCode: "93000", phone: "054-491-3825", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Jerusalem - Maalot Dafna", locationCode: "#61", contactPerson: "Location Coordinator", address: "Maalot Dafna, Jerusalem, Israel", zipCode: "97000", phone: "053-974-0653", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Jerusalem - Mem Gimmel", locationCode: "#62", contactPerson: "Location Coordinator", address: "Mem Gimmel, Jerusalem, Israel", zipCode: "94000", phone: "058-321-3943", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Neve Yaakov", locationCode: "#63", contactPerson: "Location Coordinator", address: "Neve Yaakov, Jerusalem, Israel", zipCode: "97000", phone: "052-711-7466", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Jerusalem - Pisgat Zeev (Neve HaPisga)", locationCode: "#64", contactPerson: "Location Coordinator", address: "Neve HaPisga, Pisgat Zeev, Jerusalem, Israel", zipCode: "97000", phone: "052-768-1960", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Jerusalem - Pisgat Zeev", locationCode: "#65", contactPerson: "Location Coordinator", address: "Pisgat Zeev, Jerusalem, Israel", zipCode: "97000", phone: "058-448-7134", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Jerusalem - Ramat Eshkol", locationCode: "#66", contactPerson: "Location Coordinator", address: "Ramat Eshkol, Jerusalem, Israel", zipCode: "97000", phone: "058-326-1763", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Ramat Eshkol (Second Location)", locationCode: "#67", contactPerson: "Location Coordinator", address: "Ramat Eshkol, Jerusalem, Israel", zipCode: "97000", phone: "058-325-1273", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Jerusalem - Ramat Shlomo (Rafael Baruch Toledano)", locationCode: "#68", contactPerson: "Location Coordinator", address: "15 Rafael Baruch Toledano, Ramat Shlomo, Jerusalem, Israel", zipCode: "97000", phone: "054-859-2755", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Jerusalem - Ramat Shlomo (Chazon Ish)", locationCode: "#69", contactPerson: "Location Coordinator", address: "Chazon Ish 1/1, Ramat Shlomo, Jerusalem, Israel", zipCode: "97000", phone: "053-316-8870", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Ramat Shlomo", locationCode: "#70", contactPerson: "Location Coordinator", address: "Ramat Shlomo, Jerusalem, Israel", zipCode: "97000", phone: "058-320-1963", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Jerusalem - Ramot", locationCode: "#71", contactPerson: "Location Coordinator", address: "Ramot, Jerusalem, Israel", zipCode: "97000", phone: "02-586-8904", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Jerusalem - Ramot Daled (Rechov Valenstein)", locationCode: "#72", contactPerson: "Location Coordinator", address: "Rechov Valenstein, Ramot Daled, Jerusalem, Israel", zipCode: "97000", phone: "02-651-8875", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Jerusalem - Rechavia-Nachlaot (Mordechai Narkis)", locationCode: "#73", contactPerson: "Location Coordinator", address: "Rechov Mordechai Narkis, Rechavia-Nachlaot, Jerusalem, Israel", zipCode: "94000", phone: "054-305-1823", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Romema", locationCode: "#74", contactPerson: "Location Coordinator", address: "Romema, Jerusalem, Israel", zipCode: "95000", phone: "054-845-4685", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Jerusalem - Rova Hayehudi", locationCode: "#75", contactPerson: "Location Coordinator", address: "Rova Hayehudi, Jerusalem, Israel", zipCode: "97000", phone: "050-592-4415", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Jerusalem - Sanhedria Murchevet", locationCode: "#76", contactPerson: "Location Coordinator", address: "Sanhedria Murchevet, Jerusalem, Israel", zipCode: "97000", phone: "058-320-3823", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Jerusalem - Sanz/Belz", locationCode: "#77", contactPerson: "Location Coordinator", address: "Sanz/Belz, Jerusalem, Israel", zipCode: "95000", phone: "058-321-0490", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Jerusalem - Sarei Yisroel", locationCode: "#78", contactPerson: "Location Coordinator", address: "Sarei Yisroel, Jerusalem, Israel", zipCode: "95000", phone: "054-847-0478", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Jerusalem - Kiryat HaYovel", locationCode: "#79", contactPerson: "Location Coordinator", address: "Kiryat HaYovel, Jerusalem, Israel", zipCode: "96000", phone: "054-843-3572", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 23, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Lod - Ganei Ayalon (Achisomoch)", locationCode: "#80", contactPerson: "Location Coordinator", address: "Ganei Ayalon - Achisomoch, Lod, Israel", zipCode: "71100", phone: "050-416-9168", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 28, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Lod - Shechunat Chabad", locationCode: "#81", contactPerson: "Location Coordinator", address: "Shechunat Chabad, Lod, Israel", zipCode: "71100", phone: "052-523-4091", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 28, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Afula", locationCode: "#82", contactPerson: "Location Coordinator", address: "Afula, Israel", zipCode: "18000", phone: "054-844-6642", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 29, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Beitar Illit", locationCode: "#83", contactPerson: "Location Coordinator", address: "Beitar Illit, Israel", zipCode: "90500", phone: "02-650-3688", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 27, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 12 },
  { location: { name: "Beit Shemesh - Ramat Beit Shemesh", locationCode: "#84", contactPerson: "Location Coordinator", address: "Ramat Beit Shemesh, Beit Shemesh, Israel", zipCode: "99000", phone: "058-762-4983", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 25, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Beit Shemesh - Ramat Beit Shemesh Aleph", locationCode: "#85", contactPerson: "Location Coordinator", address: "Ramat Beit Shemesh Aleph, Beit Shemesh, Israel", zipCode: "99000", phone: "058-500-9889", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 25, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Bnei Brak - Shechunat Or HaChaim", locationCode: "#86", contactPerson: "Location Coordinator", address: "Shechunat Or HaChaim, Bnei Brak, Israel", zipCode: "51100", phone: "052-768-6415", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Bnei Brak - Shichun Hey", locationCode: "#87", contactPerson: "Location Coordinator", address: "Shichun Hey, Bnei Brak, Israel", zipCode: "51100", phone: "054-844-9073", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Bnei Brak - Zichron Meir", locationCode: "#88", contactPerson: "Location Coordinator", address: "Zichron Meir, Bnei Brak, Israel", zipCode: "51100", phone: "03-570-2112", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 13 },
  { location: { name: "Bnei Brak - Rechov Sokolov", locationCode: "#89", contactPerson: "Location Coordinator", address: "Rechov Sokolov, Bnei Brak, Israel", zipCode: "51100", phone: "050-410-9336", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Bnei Brak - Rechov HaBanim", locationCode: "#90", contactPerson: "Location Coordinator", address: "Rechov HaBanim, Bnei Brak, Israel", zipCode: "51100", phone: "05-423-0031", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Bnei Brak - Pardes Katz", locationCode: "#91", contactPerson: "Location Coordinator", address: "Pardes Katz, Bnei Brak, Israel", zipCode: "51100", phone: "055-679-6880", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Bnei Brak - Rechov Amram Gaon 7 (Shikun Vav)", locationCode: "#92", contactPerson: "Location Coordinator", address: "Rechov Amram Gaon 7 (Shikun Vav), Bnei Brak, Israel", zipCode: "51100", phone: "055-677-1013", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Bnei Brak - Rechov Menachem 6", locationCode: "#93", contactPerson: "Location Coordinator", address: "Rechov Menachem 6, Bnei Brak, Israel", zipCode: "51100", phone: "053-317-6969", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Bnei Brak - Ramat Elchanan", locationCode: "#94", contactPerson: "Location Coordinator", address: "Ramat Elchanan, Bnei Brak, Israel", zipCode: "51100", phone: "054-848-2073", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 24, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 11 },
  { location: { name: "Bnei Re'em", locationCode: "#95", contactPerson: "Location Coordinator", address: "Bnei Re'em, Israel", zipCode: "79800", phone: "058-490-8084", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 40, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Elad", locationCode: "#96", contactPerson: "Location Coordinator", address: "Elad, Israel", zipCode: "40800", phone: "058-329-9178", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 30, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Givat Zeev - 33 Ha'yalot", locationCode: "#97", contactPerson: "Location Coordinator", address: "33 Ha'yalot, Givat Zeev, Israel", zipCode: "90900", phone: "054-845-2415", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 31, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Givat Zeev - 59 Ha'yalot", locationCode: "#98", contactPerson: "Location Coordinator", address: "59 Ha'yalot, Givat Zeev, Israel", zipCode: "90900", phone: "02-582-1811", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 31, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Haifa - Shechunat Hadar", locationCode: "#99", contactPerson: "Location Coordinator", address: "Shechunat Hadar, Haifa, Israel", zipCode: "33000", phone: "052-767-4800", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 32, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Kiryat Tivon", locationCode: "#100", contactPerson: "Location Coordinator", address: "Kiryat Tivon, Israel", zipCode: "36000", phone: "054-655-4710", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 33, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Kochav HaShachar", locationCode: "#101", contactPerson: "Location Coordinator", address: "Kochav HaShachar, Israel", zipCode: "90612", phone: "054-755-0642", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 34, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Maaleh Adumim", locationCode: "#102", contactPerson: "Location Coordinator", address: "Maaleh Adumim, Israel", zipCode: "98100", phone: "058-400-1438", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 35, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Modiin Illit - Netivot Hamishpat", locationCode: "#103", contactPerson: "Location Coordinator", address: "Netivot Hamishpat, Modiin Illit, Israel", zipCode: "71900", phone: "08-649-3721", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 26, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 12 },
  { location: { name: "Modiin Illit - Brachfeld", locationCode: "#104", contactPerson: "Location Coordinator", address: "Brachfeld, Modiin Illit, Israel", zipCode: "71900", phone: "054-841-6213", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 26, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Modiin Illit - Gan HaDasim", locationCode: "#105", contactPerson: "Location Coordinator", address: "Gan HaDasim, Modiin Illit, Israel", zipCode: "71900", phone: "053-312-5453", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 26, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Neriya", locationCode: "#106", contactPerson: "Location Coordinator", address: "Neriya, Israel", zipCode: "90612", phone: "052-860-0786", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 36, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Telzstone/Kiryat Yearim - Ma'alot Kedushei Telz", locationCode: "#107", contactPerson: "Location Coordinator", address: "Ma'alot Kedushei Telz 7/1, Telzstone/Kiryat Yearim, Israel", zipCode: "90840", phone: "02-534-1425", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 37, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Telzstone/Kiryat Yearim - HaRif 16", locationCode: "#108", contactPerson: "Location Coordinator", address: "HaRif 16, Telzstone/Kiryat Yearim, Israel", zipCode: "90840", phone: "058-462-6211", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 37, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Rechovot", locationCode: "#109", contactPerson: "Location Coordinator", address: "Rechovot, Israel", zipCode: "76100", phone: "052-764-1974", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 38, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Ashdod - Rova Gimmel", locationCode: "#110", contactPerson: "Location Coordinator", address: "Rova Gimmel, Ashdod, Israel", zipCode: "77100", phone: "050-413-2956", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 39, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Kfar Chabad", locationCode: "#111", contactPerson: "Location Coordinator", address: "Kfar Chabad, Israel", zipCode: "72915", phone: "054-596-8966", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 48, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Tel Aviv - Ramat Gan", locationCode: "#112", contactPerson: "Location Coordinator", address: "Ramat Gan, Tel Aviv, Israel", zipCode: "52000", phone: "052-329-9914", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 49, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "Moshav Yesodot", locationCode: "#113", contactPerson: "Location Coordinator", address: "Moshav Yesodot, Israel", zipCode: "76867", phone: "054-841-4333", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 51, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Petach Tikvah - Kfar Ganim Gimmel", locationCode: "#114", contactPerson: "Location Coordinator", address: "Kfar Ganim Gimmel, Petach Tikvah, Israel", zipCode: "49100", phone: "050-921-7651", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 50, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Shomron - Revava", locationCode: "#115", contactPerson: "Location Coordinator", address: "Revava, Shomron, Israel", zipCode: "44820", phone: "050-901-9052", email: "earmuffsgemach@gmail.com", regionId: 6, isActive: true, cityCategoryId: 52, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "Toronto - Bathurst & Lawrence", locationCode: "#116", contactPerson: "Location Coordinator", address: "Bathurst & Lawrence, Toronto, ON", zipCode: "M6A 2X7", phone: "416-785-1234", email: "earmuffsgemach@gmail.com", regionId: 2, isActive: true, cityCategoryId: 14, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Toronto - Forest Hill", locationCode: "#117", contactPerson: "Location Coordinator", address: "Forest Hill, Toronto, ON", zipCode: "M5N 2K7", phone: "416-482-5678", email: "earmuffsgemach@gmail.com", regionId: 2, isActive: true, cityCategoryId: 14, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Toronto - York Mills", locationCode: "#118", contactPerson: "Location Coordinator", address: "York Mills, Toronto, ON", zipCode: "M2P 1W5", phone: "416-225-9012", email: "earmuffsgemach@gmail.com", regionId: 2, isActive: true, cityCategoryId: 14, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Montreal - Cote St-Luc", locationCode: "#119", contactPerson: "Location Coordinator", address: "Cote St-Luc, Montreal, QC", zipCode: "H4W 2M8", phone: "514-485-3456", email: "earmuffsgemach@gmail.com", regionId: 2, isActive: true, cityCategoryId: 15, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Montreal - Hampstead", locationCode: "#120", contactPerson: "Location Coordinator", address: "Hampstead, Montreal, QC", zipCode: "H3X 3J4", phone: "514-342-7890", email: "earmuffsgemach@gmail.com", regionId: 2, isActive: true, cityCategoryId: 15, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 5 },
  { location: { name: "London - Golders Green", locationCode: "#121", contactPerson: "Location Coordinator", address: "Golders Green, London, UK", zipCode: "NW11 9DJ", phone: "+44 20 8455 1234", email: "earmuffsgemach@gmail.com", regionId: 3, isActive: true, cityCategoryId: 16, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 10 },
  { location: { name: "London - Hendon", locationCode: "#122", contactPerson: "Location Coordinator", address: "Hendon, London, UK", zipCode: "NW4 4BT", phone: "+44 20 8203 5678", email: "earmuffsgemach@gmail.com", regionId: 3, isActive: true, cityCategoryId: 16, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "London - Stamford Hill", locationCode: "#123", contactPerson: "Location Coordinator", address: "Stamford Hill, London, UK", zipCode: "N16 6XS", phone: "+44 20 8800 9012", email: "earmuffsgemach@gmail.com", regionId: 3, isActive: true, cityCategoryId: 16, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 12 },
  { location: { name: "Manchester - Prestwich", locationCode: "#124", contactPerson: "Location Coordinator", address: "Prestwich, Manchester, UK", zipCode: "M25 1AJ", phone: "+44 161 773 3456", email: "earmuffsgemach@gmail.com", regionId: 3, isActive: true, cityCategoryId: 17, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Manchester - Whitefield", locationCode: "#125", contactPerson: "Location Coordinator", address: "Whitefield, Manchester, UK", zipCode: "M45 7TA", phone: "+44 161 796 7890", email: "earmuffsgemach@gmail.com", regionId: 3, isActive: true, cityCategoryId: 17, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Antwerp - Borgerhout", locationCode: "#126", contactPerson: "Location Coordinator", address: "Borgerhout, Antwerp, Belgium", zipCode: "2140", phone: "+32 3 271 1234", email: "earmuffsgemach@gmail.com", regionId: 4, isActive: true, cityCategoryId: 18, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
  { location: { name: "Antwerp - Berchem", locationCode: "#127", contactPerson: "Location Coordinator", address: "Berchem, Antwerp, Belgium", zipCode: "2600", phone: "+32 3 230 5678", email: "earmuffsgemach@gmail.com", regionId: 4, isActive: true, cityCategoryId: 18, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 6 },
  { location: { name: "Melbourne - Caulfield", locationCode: "#128", contactPerson: "Location Coordinator", address: "Caulfield, Melbourne, VIC", zipCode: "3161", phone: "+61 3 9523 1234", email: "earmuffsgemach@gmail.com", regionId: 5, isActive: true, cityCategoryId: 21, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 9 },
  { location: { name: "Melbourne - St Kilda", locationCode: "#129", contactPerson: "Location Coordinator", address: "St Kilda, Melbourne, VIC", zipCode: "3182", phone: "+61 3 9534 5678", email: "earmuffsgemach@gmail.com", regionId: 5, isActive: true, cityCategoryId: 21, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 7 },
  { location: { name: "Sydney - Bondi", locationCode: "#130", contactPerson: "Location Coordinator", address: "Bondi, Sydney, NSW", zipCode: "2026", phone: "+61 2 9130 9012", email: "earmuffsgemach@gmail.com", regionId: 5, isActive: true, cityCategoryId: 22, operatorPin: "1234", depositAmount: 20, paymentMethods: ["cash"], processingFeePercent: 300 }, inventoryCount: 8 },
];

async function seedRegions(): Promise<void> {
  console.log("Seeding regions...");
  try {
    const result = await db.select({ id: regions.id }).from(regions).limit(1);
    if (result && result.length > 0) {
      console.log(`  Skipping: regions already exist`);
      return;
    }
  } catch (e) {
    // Table may be empty - continue with insert
  }
  await db.insert(regions).values(defaultRegions);
  console.log(`  Inserted ${defaultRegions.length} regions`);
}

async function seedCityCategories(): Promise<void> {
  console.log("Seeding city categories...");
  try {
    const result = await db.select({ id: cityCategories.id }).from(cityCategories).limit(1);
    if (result && result.length > 0) {
      console.log(`  Skipping: city categories already exist`);
      return;
    }
  } catch (e) {
    // Table may be empty - continue with insert
  }
  await db.insert(cityCategories).values(defaultCityCategories);
  console.log(`  Inserted ${defaultCityCategories.length} city categories`);
}

async function seedLocations(): Promise<Map<string, number>> {
  console.log("Seeding locations...");
  const locationCodeToId = new Map<string, number>();
  
  try {
    const result = await db.select({ id: locations.id, locationCode: locations.locationCode }).from(locations).limit(1);
    if (result && result.length > 0) {
      console.log(`  Skipping: locations already exist, fetching existing IDs...`);
      const allExisting = await db.select({ id: locations.id, locationCode: locations.locationCode }).from(locations);
      if (allExisting) {
        allExisting.forEach((loc) => {
          locationCodeToId.set(loc.locationCode, loc.id);
        });
      }
      return locationCodeToId;
    }
  } catch (e) {
    // Table may be empty - continue with insert
  }
  
  const locationData = allLocations.map((item) => item.location);
  await db.insert(locations).values(locationData);
  
  const insertedLocations = await db.select({ id: locations.id, locationCode: locations.locationCode }).from(locations);
  if (insertedLocations) {
    insertedLocations.forEach((loc) => {
      locationCodeToId.set(loc.locationCode, loc.id);
    });
  }
  
  console.log(`  Inserted ${locationData.length} locations`);
  return locationCodeToId;
}

async function seedInventory(locationCodeToId: Map<string, number>): Promise<void> {
  console.log("Seeding inventory...");
  try {
    const result = await db.select({ id: inventory.id }).from(inventory).limit(1);
    if (result && result.length > 0) {
      console.log(`  Skipping: inventory already exists`);
      return;
    }
  } catch (e) {
    // Table may be empty - continue with insert
  }
  
  const inventoryItems: InsertInventory[] = [];
  
  for (const item of allLocations) {
    const locationId = locationCodeToId.get(item.location.locationCode);
    if (!locationId) continue;
    
    if (item.inventoryByColor) {
      for (const [color, quantity] of Object.entries(item.inventoryByColor)) {
        inventoryItems.push({
          locationId,
          color,
          quantity,
        });
      }
    } else if (item.inventoryCount) {
      inventoryItems.push({
        locationId,
        color: "black",
        quantity: item.inventoryCount,
      });
    }
  }
  
  if (inventoryItems.length > 0) {
    await db.insert(inventory).values(inventoryItems);
  }
  
  console.log(`  Inserted ${inventoryItems.length} inventory items`);
}

export async function seed(): Promise<void> {
  console.log("Starting database seed...\n");
  
  try {
    await seedRegions();
    await seedCityCategories();
    const locationCodeToId = await seedLocations();
    await seedInventory(locationCodeToId);
    
    console.log("\nDatabase seed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log("Seed script finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed script failed:", error);
    process.exit(1);
  });
