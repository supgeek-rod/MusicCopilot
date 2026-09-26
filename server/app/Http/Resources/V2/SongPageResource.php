<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * V2 统一分页形态：{items, total, page, pageSize}。
 * 替代搜索旧响应的 records/searchTotal/searchIndex/searchSize/searchKeyWork
 * 与任务列表的 MyBatis-Plus 风格 records/total/size/current/pages。
 * 各子类显式写 toArray（不抽动态基类）：Scramble 靠字面调用推断响应 schema。
 *
 * @property array{items: mixed, total: int, page: int, pageSize: int} $resource
 */
class SongPageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'items' => SongResource::collection($this->resource['items']),
            'total' => (int) $this->resource['total'],
            'page' => (int) $this->resource['page'],
            'pageSize' => (int) $this->resource['pageSize'],
        ];
    }
}
