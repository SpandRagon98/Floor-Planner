export const ROOM_COLORS = [
  "#eef4ff",
  "#f4f7ec",
  "#fff2e8",
  "#f3efff",
  "#e9fbf6",
  "#fff7db",
];

export const WALL_OPTIONS = ["top", "bottom", "left", "right"];

export const PRODUCT_CATEGORIES = [
  "storage",
  "office",
  "cafe",
  "house",
  "public toilet",
  "security cabin",
];

export const FLOOR_TEXTURE_LIBRARY = [
  {
    id: "white-marble",
    name: "White Marble",
    image: "textures/white-marble.png",
    tileWidth: 2,
    tileHeight: 2,
    category: "marble",
  },
  {
    id: "beige-marble",
    name: "Beige Marble",
    image: "textures/beige-marble.png",
    tileWidth: 2,
    tileHeight: 2,
    category: "marble",
  },
  {
    id: "grey-concrete",
    name: "Grey Concrete Tile",
    image: "textures/grey-concrete-tile.png",
    tileWidth: 2,
    tileHeight: 2,
    category: "concrete",
  },
  {
    id: "wood-floor",
    name: "Wood Floor",
    image: "textures/wood-floor.png",
    tileWidth: 0.6,
    tileHeight: 3,
    category: "wood",
  },
  {
    id: "patterned-tile",
    name: "Patterned Tile",
    image: "textures/patterned-tile.png",
    tileWidth: 1,
    tileHeight: 1,
    category: "decorative",
  },
  {
    id: "glossy-cream",
    name: "Glossy Cream Tile",
    image: "textures/glossy-cream-tile.png",
    tileWidth: 2,
    tileHeight: 2,
    category: "ceramic",
  },
];

export const FURNITURE_PRODUCT_RECOMMENDATIONS = {
  "bed (single / double)": [
    {
      id: "tree-mart-bed",
      title: "TREE MART Wooden King Size Bed with Storage",
      price: "₹25,999",
      url: "https://www.amazon.in/TREE-MART-Sheesham-Recommended-Mattress/dp/B0F3P9LWTY",
      image: "products/bed-wooden.jpg",
    },
    {
      id: "designfit-bed",
      title: "DesignFit Engineered Wood King Size Bed with Box Storage",
      price: "₹19,497",
      url: "https://www.amazon.in/DesignFit-Engineered-Storage-Furniture-Warranty/dp/B0DXF3G56S",
      image: "products/bed-black.jpg",
    },
    {
      id: "royaloak-bed",
      title: "Royaloak Luxe Queen Size Bed with Hydraulic Storage",
      price: "₹38,999",
      url: "https://www.amazon.in/dp/B0DSG85S7V",
      image: "products/bed-ash.jpg",
    },
  ],
};

export const TOILET_SEAT_FURNITURE = { type: "Toilet Seat (WC)", width: 2.5, depth: 4, height: 3, color: "#dbe7f2" };

export const EXTRA_FURNITURE = [
  { type: "Steel Staircase", width: 4, depth: 8, height: 10, color: "#8a9ab5", allowOutsideBuilding: true },
];

export const FURNITURE_PRESETS = {
  storage: [
    TOILET_SEAT_FURNITURE,
    { type: "Storage Rack", width: 6, depth: 2, height: 7, color: "#c9d4e5" },
    { type: "Pallet Stack", width: 4, depth: 4, height: 4, color: "#d9c3a2" },
    { type: "Small Shelf Unit", width: 3, depth: 1.5, height: 5, color: "#cfd8c8" },
    { type: "Heavy Duty Shelf", width: 8, depth: 2.5, height: 8, color: "#b8c4d7" },
    { type: "Utility Table", width: 5, depth: 2.5, height: 3, color: "#ddd4c8" },
    ...EXTRA_FURNITURE,
  ],
  office: [
    TOILET_SEAT_FURNITURE,
    { type: "Workstation Desk", width: 5, depth: 2.5, height: 2.5, color: "#d4dde8" },
    { type: "Office Chair", width: 2, depth: 2, height: 3, color: "#bcc7d9" },
    { type: "Conference Table", width: 8, depth: 4, height: 2.5, color: "#d8d1c5" },
    { type: "Storage Cabinet", width: 4, depth: 1.5, height: 6, color: "#c7d0c0" },
    { type: "Reception Desk", width: 7, depth: 3, height: 3.5, color: "#d7c8bf" },
    ...EXTRA_FURNITURE,
  ],
  cafe: [
    TOILET_SEAT_FURNITURE,
    { type: "2-Seater Table", width: 2.5, depth: 2.5, height: 2.5, color: "#dfd2c2" },
    { type: "4-Seater Table", width: 4, depth: 4, height: 2.5, color: "#d7cab8" },
    { type: "Chair", width: 1.8, depth: 1.8, height: 3, color: "#c7b9ab" },
    { type: "Service Counter / Cash Desk", width: 6, depth: 2.5, height: 3.5, color: "#d8c3b8" },
    { type: "Display Unit", width: 4, depth: 2, height: 5, color: "#d3ddd5" },
    ...EXTRA_FURNITURE,
  ],
  house: [
    TOILET_SEAT_FURNITURE,
    { type: "Bed (Single / Double)", width: 6.5, depth: 7, height: 2, color: "#d5dce8" },
    { type: "Wardrobe", width: 5, depth: 2, height: 7, color: "#c7d0bf" },
    { type: "Sofa", width: 7, depth: 3, height: 3, color: "#c8d6ea" },
    { type: "Center Table", width: 4, depth: 2, height: 1.5, color: "#ddd3c5" },
    { type: "Kitchen Counter", width: 8, depth: 2, height: 3, color: "#d4d8dc" },
    { type: "Kitchen Slab", width: 8, depth: 2, height: 3, color: "#cfd6de", wallAttached: true },
    { type: "Stove / Cooktop", width: 2.5, depth: 2, height: 2.8, color: "#c9c9cf" },
    { type: "Sink", width: 2.5, depth: 2, height: 3, color: "#c5dbe5" },
    { type: "Dining Table", width: 6, depth: 3.5, height: 2.5, color: "#d8ccb9" },
    ...EXTRA_FURNITURE,
  ],
  "public toilet": [
    TOILET_SEAT_FURNITURE,
    { type: "Urinal", width: 2, depth: 1.5, height: 3.5, color: "#d8e7ef" },
    { type: "Wash Basin", width: 2, depth: 1.5, height: 3, color: "#d9eef5" },
    { type: "Mirror Panel", width: 3, depth: 0.3, height: 4, color: "#d3e7f8" },
    { type: "Partition Wall", width: 3, depth: 0.3, height: 6.5, color: "#cfd4dd" },
    ...EXTRA_FURNITURE,
  ],
  "security cabin": [
    TOILET_SEAT_FURNITURE,
    { type: "Guard Chair", width: 2, depth: 2, height: 3, color: "#bfc9d7" },
    { type: "Small Desk", width: 4, depth: 2, height: 2.5, color: "#d7cdbf" },
    { type: "Storage Shelf", width: 3, depth: 1.5, height: 6, color: "#c8d1c2" },
    { type: "CCTV Monitor Unit", width: 3, depth: 1.5, height: 4, color: "#c9d3e4" },
    { type: "Barrier Control Panel", width: 2.5, depth: 1.5, height: 3.5, color: "#d2c9be" },
    ...EXTRA_FURNITURE,
  ],
};
