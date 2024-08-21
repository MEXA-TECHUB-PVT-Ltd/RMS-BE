exports.pagination = (totalItems, limit, page) => {
  return {
    totalItems: totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
  };
};
