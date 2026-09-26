<?php

namespace App\Http\Resources\V2;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 下载创建结果：{tasks: TaskResource[]}。单曲创建含 1 项、整张专辑同步展开含 N 项
 * （前端取长度做计数提示）；歌手全部专辑为异步展开，走 202 {queued: true}。
 *
 * @property array{tasks: mixed} $resource
 */
class TaskListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'tasks' => TaskResource::collection($this->resource['tasks']),
        ];
    }
}
