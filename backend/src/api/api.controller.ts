import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiService } from './api.service';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get(':collection')
  async getList(@Param('collection') collection: string, @Query() query: any) {
    return this.apiService.getList(collection, query);
  }

  @Get(':collection/:id')
  async getOne(@Param('collection') collection: string, @Param('id') id: string) {
    return this.apiService.getOne(collection, id);
  }

  @Post(':collection')
  async create(@Param('collection') collection: string, @Body() body: any) {
    return this.apiService.create(collection, body);
  }

  @Put(':collection/:id')
  async update(@Param('collection') collection: string, @Param('id') id: string, @Body() body: any) {
    return this.apiService.update(collection, id, body);
  }

  @Delete(':collection/:id')
  async remove(@Param('collection') collection: string, @Param('id') id: string) {
    return this.apiService.remove(collection, id);
  }
}
